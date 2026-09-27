require("dotenv").config();

const express = require("express");
const WebSocket = require("ws");
const { Pool } = require("pg");

const PORT = Number(process.env.PORT) || 8080;

const VALID_ROOM_KEYS = new Set([
    "default",
    "6167",
    "testing",
]);

const ALLOWED_REACTIONS = new Set([
    "👍",
    "❤️",
    "😂",
    "😮",
    "😢",
    "👎",
]);

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,

    ssl:
        process.env.NODE_ENV === "production"
            ? { rejectUnauthorized: false }
            : false,

    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

async function initializeDatabase() {
    /*
     * Create the messages table.
     *
     * reply_to points to another message.
     *
     * Example:
     *
     * Message #20:
     * "Anyone want pizza?"
     *
     * Message #21:
     * "Yes!"
     * reply_to = 20
     */
    await pool.query(`
        CREATE TABLE IF NOT EXISTS messages (
            id BIGSERIAL PRIMARY KEY,
            username TEXT NOT NULL,
            message TEXT NOT NULL,
            room_key VARCHAR(100) NOT NULL DEFAULT 'default',
            reply_to BIGINT REFERENCES messages(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    /*
     * This handles databases where the messages table
     * already existed before replies were added.
     */
    await pool.query(`
        ALTER TABLE messages
        ADD COLUMN IF NOT EXISTS reply_to BIGINT
        REFERENCES messages(id)
        ON DELETE SET NULL
    `);

    /*
     * Reactions are stored separately.
     *
     * One user can have one of each reaction on a message.
     *
     * Example:
     *
     * message_id | username | reaction
     * --------------------------------
     * 20         | Alice    | 👍
     * 20         | Bob      | 👍
     * 20         | Bob      | ❤️
     */
    await pool.query(`
        CREATE TABLE IF NOT EXISTS message_reactions (
            id BIGSERIAL PRIMARY KEY,
            message_id BIGINT NOT NULL
                REFERENCES messages(id)
                ON DELETE CASCADE,

            username TEXT NOT NULL,
            reaction VARCHAR(20) NOT NULL,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            UNIQUE(message_id, username, reaction)
        )
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_message_reactions_message_id
        ON message_reactions(message_id)
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_messages_room_key
        ON messages(room_key)
    `);

    console.log("Database connected");
}

const app = express();

app.disable("x-powered-by");

app.use(express.static(__dirname));

app.get("/health", async (req, res) => {
    try {
        await pool.query("SELECT 1");

        res.json({
            status: "ok",
            database: "ok",
        });
    } catch (error) {
        console.error("Health check error:", error);

        res.status(503).json({
            status: "error",
            database: "unavailable",
        });
    }
});

function sendJSON(socket, data) {
    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(data));
    }
}

/*
 * Send data to every authenticated client
 * inside the same room.
 */
function broadcastToRoom(roomKey, data) {
    websocketServer.clients.forEach((client) => {
        if (
            client.readyState === WebSocket.OPEN &&
            client.authenticated &&
            client.roomKey === roomKey
        ) {
            sendJSON(client, data);
        }
    });
}

/*
 * Get reaction counts for a message.
 *
 * Returns:
 *
 * {
 *     "👍": 3,
 *     "❤️": 2,
 *     "😂": 1
 * }
 */
async function getReactionCounts(messageId) {
    const result = await pool.query(
        `
            SELECT
                reaction,
                COUNT(*)::int AS count
            FROM public.message_reactions
            WHERE message_id = $1
            GROUP BY reaction
            ORDER BY reaction
        `,
        [messageId]
    );

    const reactions = {};

    for (const row of result.rows) {
        reactions[row.reaction] = row.count;
    }

    return reactions;
}

/*
 * Get all reactions for a message, including
 * which users reacted.
 *
 * This is useful if you eventually want the frontend
 * to show who reacted.
 */
async function getReactionUsers(messageId) {
    const result = await pool.query(
        `
            SELECT
                reaction,
                username
            FROM public.message_reactions
            WHERE message_id = $1
            ORDER BY created_at ASC
        `,
        [messageId]
    );

    const users = {};

    for (const row of result.rows) {
        if (!users[row.reaction]) {
            users[row.reaction] = [];
        }

        users[row.reaction].push(row.username);
    }

    return users;
}

/*
 * Check whether a message exists in a particular room.
 *
 * This prevents someone from replying to a message
 * belonging to another room.
 */
async function messageBelongsToRoom(messageId, roomKey) {
    const result = await pool.query(
        `
            SELECT id
            FROM public.messages
            WHERE id = $1
              AND room_key = $2
            LIMIT 1
        `,
        [messageId, roomKey]
    );

    return result.rowCount > 0;
}

let httpServer;
let websocketServer;

async function startServer() {
    try {
        await initializeDatabase();

        httpServer = app.listen(PORT, "0.0.0.0", () => {
            console.log(`Server running on port ${PORT}`);
        });

        websocketServer = new WebSocket.Server({
            server: httpServer,
            maxPayload: 64 * 1024,
        });

        setupWebSocket();
    } catch (error) {
        console.error("Failed to start server:", error);

        await pool.end().catch(() => {});

        process.exit(1);
    }
}

function setupWebSocket() {
    websocketServer.on("connection", (socket) => {
        console.log("New connection");

        socket.authenticated = false;
        socket.username = null;
        socket.roomKey = null;

        socket.on("message", async (rawMessage) => {
            try {
                const data = JSON.parse(rawMessage.toString());

                /*
                 * ============================
                 * LOGIN
                 * ============================
                 */
                if (data.type === "login") {
                    if (socket.authenticated) {
                        sendJSON(socket, {
                            type: "login",
                            success: false,
                            error: "You are already logged in.",
                        });

                        return;
                    }

                    const username = String(
                        data.username || ""
                    ).trim();

                    const roomKey = String(
                        data.roomKey || ""
                    ).trim();

                    if (username === "") {
                        sendJSON(socket, {
                            type: "login",
                            success: false,
                            error: "Please enter a username.",
                        });

                        return;
                    }

                    if (username.length > 30) {
                        sendJSON(socket, {
                            type: "login",
                            success: false,
                            error: "Username is too long.",
                        });

                        return;
                    }

                    /*
                     * Validate the room.
                     *
                     * If you want arbitrary room keys later,
                     * remove this block.
                     */
                    if (!VALID_ROOM_KEYS.has(roomKey)) {
                        sendJSON(socket, {
                            type: "login",
                            success: false,
                            error: "Invalid channel key.",
                        });

                        return;
                    }

                    let history;

                    try {
                        /*
                         * Load the latest 100 messages.
                         *
                         * Also loads:
                         * - reply_to
                         * - created_at
                         * - reaction counts
                         */
                        history = await pool.query(
                            `
                                SELECT
                                    m.id,
                                    m.username,
                                    m.message,
                                    m.reply_to,


                                    COALESCE(
                                        (
                                            SELECT json_object_agg(
                                                r.reaction,
                                                r.count
                                            )
                                            FROM (
                                                SELECT
                                                    reaction,
                                                    COUNT(*)::int AS count
                                                FROM public.message_reactions
                                                WHERE message_id = m.id
                                                GROUP BY reaction
                                            ) r
                                        ),
                                        '{}'::json
                                    ) AS reactions

                                FROM public.messages m

                                WHERE m.room_key = $1

                                ORDER BY m.id DESC

                                LIMIT 100
                            `,
                            [roomKey]
                        );
                    } catch (error) {
                        console.error(
                            "History database error:",
                            error
                        );

                        sendJSON(socket, {
                            type: "login",
                            success: false,
                            error: "Unable to load chat history.",
                        });

                        return;
                    }

                    socket.authenticated = true;
                    socket.username = username;
                    socket.roomKey = roomKey;

                    console.log(
                        `${username} joined the private channel.`
                    );

                    sendJSON(socket, {
                        type: "login",
                        success: true,
                        username,
                        roomKey,
                    });

                    /*
                     * History is reversed so that the oldest
                     * message appears first.
                     */
                    sendJSON(socket, {
                        type: "history",
                        messages: history.rows.reverse(),
                    });

                    return;
                }

                /*
                 * Everything below this point requires login.
                 */
                if (!socket.authenticated) {
                    sendJSON(socket, {
                        type: "error",
                        error: "You must enter the channel first.",
                    });

                    return;
                }

                /*
                 * ============================
                 * TYPING
                 * ============================
                 */
                if (data.type === "typing") {
                    websocketServer.clients.forEach((client) => {
                        if (
                            client !== socket &&
                            client.readyState === WebSocket.OPEN &&
                            client.authenticated &&
                            client.roomKey === socket.roomKey
                        ) {
                            sendJSON(client, {
                                type: "typing",
                                username: socket.username,
                                typing: Boolean(data.typing),
                            });
                        }
                    });

                    return;
                }

                /*
                 * ============================
                 * MESSAGE / REPLY
                 * ============================
                 */
                if (data.type === "message") {
                    const messageText = String(
                        data.message || ""
                    ).trim();

                    if (messageText === "") {
                        return;
                    }

                    if (messageText.length > 2000) {
                        sendJSON(socket, {
                            type: "error",
                            error: "Message is too long.",
                        });

                        return;
                    }

                    /*
                     * replyTo is optional.
                     *
                     * Normal message:
                     *
                     * {
                     *     type: "message",
                     *     message: "Hello"
                     * }
                     *
                     * Reply:
                     *
                     * {
                     *     type: "message",
                     *     message: "I agree",
                     *     replyTo: 123
                     * }
                     */
                    let replyTo = null;

                    if (
                        data.replyTo !== null &&
                        data.replyTo !== undefined &&
                        data.replyTo !== ""
                    ) {
                        replyTo = Number(data.replyTo);

                        if (
                            !Number.isInteger(replyTo) ||
                            replyTo <= 0
                        ) {
                            sendJSON(socket, {
                                type: "error",
                                error: "Invalid reply message.",
                            });

                            return;
                        }

                        /*
                         * Make sure the replied-to message
                         * actually belongs to this room.
                         */
                        const replyExists =
                            await messageBelongsToRoom(
                                replyTo,
                                socket.roomKey
                            );

                        if (!replyExists) {
                            sendJSON(socket, {
                                type: "error",
                                error:
                                    "The message you are replying to does not exist.",
                            });

                            return;
                        }
                    }

                    const result = await pool.query(
                        `
                            INSERT INTO public.messages
                                (
                                    username,
                                    message,
                                    room_key,
                                    reply_to
                                )
                            VALUES
                                ($1, $2, $3, $4)

                            RETURNING
                                id,
                                username,
                                message,
                                reply_to,
                                room_key
                        `,
                        [
                            socket.username,
                            messageText,
                            socket.roomKey,
                            replyTo,
                        ]
                    );

                    const message = result.rows[0];

                    console.log(
                        `Message saved: ${message.username}: ${message.message}`
                    );

                    /*
                     * If this is a reply, get information
                     * about the original message.
                     */
                    let reply = null;

                    if (message.reply_to !== null) {
                        const replyResult =
                            await pool.query(
                                `
                                    SELECT
                                        id,
                                        username,
                                        message
                                    FROM public.messages
                                    WHERE id = $1
                                    LIMIT 1
                                `,
                                [message.reply_to]
                            );

                        if (replyResult.rowCount > 0) {
                            reply = replyResult.rows[0];
                        }
                    }

                    /*
                     * Send the new message to everyone
                     * in this room.
                     */
                    broadcastToRoom(socket.roomKey, {
                        type: "message",

                        id: message.id,

                        username: message.username,

                        message: message.message,

                        reply_to: message.reply_to,

                        created_at: message.created_at,

                        room_key: message.room_key,

                        reply,

                        reactions: {},
                    });

                    return;
                }

                /*
                 * ============================
                 * REACTION
                 * ============================
                 *
                 * Client sends:
                 *
                 * {
                 *     type: "reaction",
                 *     messageId: 123,
                 *     reaction: "👍"
                 * }
                 */
                if (data.type === "reaction") {
                    const messageId = Number(
                        data.messageId
                    );

                    const reaction = String(
                        data.reaction || ""
                    ).trim();

                    if (
                        !Number.isInteger(messageId) ||
                        messageId <= 0
                    ) {
                        sendJSON(socket, {
                            type: "error",
                            error: "Invalid message ID.",
                        });

                        return;
                    }

                    if (!ALLOWED_REACTIONS.has(reaction)) {
                        sendJSON(socket, {
                            type: "error",
                            error: "Invalid reaction.",
                        });

                        return;
                    }

                    /*
                     * Verify that the message exists
                     * in this user's room.
                     */
                    const messageExists =
                        await messageBelongsToRoom(
                            messageId,
                            socket.roomKey
                        );

                    if (!messageExists) {
                        sendJSON(socket, {
                            type: "error",
                            error: "Message not found.",
                        });

                        return;
                    }

                    /*
                     * Check if this user already has
                     * this reaction.
                     */
                    const existingReaction =
                        await pool.query(
                            `
                                SELECT id
                                FROM public.message_reactions

                                WHERE message_id = $1
                                  AND username = $2
                                  AND reaction = $3

                                LIMIT 1
                            `,
                            [
                                messageId,
                                socket.username,
                                reaction,
                            ]
                        );

                    if (existingReaction.rowCount > 0) {
                        /*
                         * Reaction already exists.
                         *
                         * Clicking again removes it.
                         */
                        await pool.query(
                            `
                                DELETE FROM public.message_reactions
                                WHERE id = $1
                            `,
                            [
                                existingReaction
                                    .rows[0]
                                    .id,
                            ]
                        );

                        console.log(
                            `${socket.username} removed ${reaction} from message ${messageId}`
                        );
                    } else {
                        /*
                         * Add reaction.
                         */
                        await pool.query(
                            `
                                INSERT INTO public.message_reactions
                                    (
                                        message_id,
                                        username,
                                        reaction
                                    )
                                VALUES
                                    ($1, $2, $3)

                                ON CONFLICT
                                    (
                                        message_id,
                                        username,
                                        reaction
                                    )
                                DO NOTHING
                            `,
                            [
                                messageId,
                                socket.username,
                                reaction,
                            ]
                        );

                        console.log(
                            `${socket.username} reacted ${reaction} to message ${messageId}`
                        );
                    }

                    /*
                     * Get updated reaction counts.
                     */
                    const reactions =
                        await getReactionCounts(
                            messageId
                        );

                    /*
                     * Get users for each reaction.
                     *
                     * This isn't strictly necessary for
                     * the UI, but it's useful information
                     * for future features.
                     */
                    const reactionUsers =
                        await getReactionUsers(
                            messageId
                        );

                    /*
                     * Broadcast updated reaction
                     * information to everyone in the room.
                     */
                    broadcastToRoom(
                        socket.roomKey,
                        {
                            type: "reaction",

                            messageId,

                            reactions,

                            reactionUsers,
                        }
                    );

                    return;
                }

                /*
                 * ============================
                 * UNKNOWN REQUEST
                 * ============================
                 */
                sendJSON(socket, {
                    type: "error",
                    error: "Unknown request.",
                });
            } catch (error) {
                console.error(
                    "Request error:",
                    error
                );

                sendJSON(socket, {
                    type: "error",
                    error: "Server error.",
                });
            }
        });

        /*
         * ============================
         * CONNECTION CLOSED
         * ============================
         */
        socket.on("close", () => {
            if (socket.username) {
                console.log(
                    `${socket.username} left the private channel.`
                );
            }
        });

        /*
         * ============================
         * WEBSOCKET ERROR
         * ============================
         */
        socket.on("error", (error) => {
            console.error(
                "WebSocket error:",
                error
            );
        });
    });
}

/*
 * ============================
 * SERVER SHUTDOWN
 * ============================
 */
async function shutdown(signal) {
    console.log(
        `${signal} received. Shutting down...`
    );

    if (websocketServer) {
        websocketServer.clients.forEach(
            (client) => {
                if (
                    client.readyState ===
                    WebSocket.OPEN
                ) {
                    client.close(
                        1001,
                        "Server shutting down."
                    );
                }
            }
        );

        websocketServer.close();
    }

    if (httpServer) {
        await new Promise((resolve) => {
            httpServer.close(resolve);
        });
    }

    await pool.end();

    console.log(
        "Server shut down cleanly."
    );

    process.exit(0);
}

process.on("SIGINT", () =>
    shutdown("SIGINT")
);

process.on("SIGTERM", () =>
    shutdown("SIGTERM")
);

startServer();
