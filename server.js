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

// ============================================================
// ALLOWED REACTIONS
// ============================================================

const ALLOWED_REACTIONS = new Set([
    "🖤",
    "❤️",
    "😆",
    "😮",
    "😢",
    "🥹",
]);

// ============================================================
// DATABASE
// ============================================================

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


// ============================================================
// DATABASE INITIALIZATION
// ============================================================

async function initializeDatabase() {

    // ========================================================
    // MESSAGES
    // ========================================================

    await pool.query(`
        CREATE TABLE IF NOT EXISTS messages (
            id BIGSERIAL PRIMARY KEY,

            username TEXT NOT NULL,

            message TEXT NOT NULL,

            room_key VARCHAR(100)
                NOT NULL
                DEFAULT 'default',

            reply_to BIGINT
                REFERENCES messages(id)
                ON DELETE SET NULL,

            created_at TIMESTAMPTZ
                NOT NULL
                DEFAULT NOW(),

            edited_at TIMESTAMPTZ
        )
    `);


    // ========================================================
    // ADD NEW MESSAGE COLUMNS IF NEEDED
    // ========================================================

    await pool.query(`
        ALTER TABLE messages
        ADD COLUMN IF NOT EXISTS reply_to BIGINT
        REFERENCES messages(id)
        ON DELETE SET NULL
    `);


    await pool.query(`
        ALTER TABLE messages
        ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ
    `);


    // ========================================================
    // REACTIONS TABLE
    // ========================================================

    await pool.query(`
        CREATE TABLE IF NOT EXISTS message_reactions (
            id BIGSERIAL PRIMARY KEY,

            message_id BIGINT NOT NULL
                REFERENCES messages(id)
                ON DELETE CASCADE,

            username TEXT NOT NULL,

            reaction VARCHAR(20) NOT NULL,

            created_at TIMESTAMPTZ
                NOT NULL
                DEFAULT NOW()
        )
    `);


    // ========================================================
    // FIX REACTION CONSTRAINT
    //
    // A user can have ONE OF EACH reaction on a message.
    //
    // Example:
    //
    // user1 + message1 + 🖤
    // user1 + message1 + ❤️
    //
    // Both are allowed.
    //
    // But this is NOT allowed:
    //
    // user1 + message1 + 🖤
    // user1 + message1 + 🖤
    // ========================================================

    await pool.query(`
        ALTER TABLE message_reactions
        DROP CONSTRAINT IF EXISTS message_reactions_message_id_username_key
    `);


    await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS
        message_reactions_message_user_reaction_unique

        ON message_reactions(
            message_id,
            username,
            reaction
        )
    `);


    // ========================================================
    // INDEXES
    // ========================================================

    await pool.query(`
        CREATE INDEX IF NOT EXISTS
        idx_message_reactions_message_id

        ON message_reactions(message_id)
    `);


    await pool.query(`
        CREATE INDEX IF NOT EXISTS
        idx_messages_room_key

        ON messages(room_key)
    `);


    console.log("Database connected");
}


// ============================================================
// EXPRESS
// ============================================================

const app = express();

app.disable("x-powered-by");

app.use(express.static(__dirname));


// ============================================================
// HEALTH CHECK
// ============================================================

app.get("/health", async (req, res) => {

    try {

        await pool.query("SELECT 1");

        res.json({
            status: "ok",
            database: "ok",
        });

    } catch (error) {

        console.error(
            "Health check error:",
            error
        );

        res.status(503).json({
            status: "error",
            database: "unavailable",
        });
    }
});


// ============================================================
// WEBSOCKET VARIABLES
// ============================================================

let httpServer;

let websocketServer;


// ============================================================
// SEND JSON
// ============================================================

function sendJSON(socket, data) {

    if (
        socket.readyState ===
        WebSocket.OPEN
    ) {

        socket.send(
            JSON.stringify(data)
        );
    }
}


// ============================================================
// BROADCAST TO ROOM
// ============================================================

function broadcastToRoom(
    roomKey,
    data
) {

    websocketServer.clients.forEach(
        (client) => {

            if (
                client.readyState ===
                    WebSocket.OPEN &&

                client.authenticated &&

                client.roomKey ===
                    roomKey
            ) {

                sendJSON(
                    client,
                    data
                );
            }
        }
    );
}


// ============================================================
// GET REACTION COUNTS
// ============================================================

async function getReactionCounts(
    messageId
) {

    const result =
        await pool.query(
            `
                SELECT
                    reaction,
                    COUNT(*)::int AS count

                FROM public.message_reactions

                WHERE message_id = $1

                GROUP BY reaction

                ORDER BY reaction
            `,
            [
                messageId,
            ]
        );


    const reactions = {};


    for (
        const row of result.rows
    ) {

        reactions[
            row.reaction
        ] = row.count;
    }


    return reactions;
}


// ============================================================
// GET REACTION USERS
// ============================================================

async function getReactionUsers(
    messageId
) {

    const result =
        await pool.query(
            `
                SELECT
                    reaction,
                    username

                FROM public.message_reactions

                WHERE message_id = $1

                ORDER BY created_at ASC
            `,
            [
                messageId,
            ]
        );


    const users = {};


    for (
        const row of result.rows
    ) {

        if (
            !users[row.reaction]
        ) {

            users[row.reaction] = [];
        }


        users[
            row.reaction
        ].push(
            row.username
        );
    }


    return users;
}


// ============================================================
// CHECK MESSAGE BELONGS TO ROOM
// ============================================================

async function messageBelongsToRoom(
    messageId,
    roomKey
) {

    const result =
        await pool.query(
            `
                SELECT id

                FROM public.messages

                WHERE id = $1
                  AND room_key = $2

                LIMIT 1
            `,
            [
                messageId,
                roomKey,
            ]
        );


    return result.rowCount > 0;
}


// ============================================================
// START SERVER
// ============================================================

async function startServer() {

    try {

        await initializeDatabase();


        // ====================================================
        // HTTP SERVER
        // ====================================================

        httpServer =
            app.listen(
                PORT,
                "0.0.0.0",
                () => {

                    console.log(
                        `Server running on port ${PORT}`
                    );
                }
            );


        // ====================================================
        // WEBSOCKET SERVER
        // ====================================================

        websocketServer =
            new WebSocket.Server({
                server: httpServer,

                maxPayload:
                    64 * 1024,
            });


        setupWebSocket();

    } catch (error) {

        console.error(
            "Failed to start server:",
            error
        );


        await pool
            .end()
            .catch(() => {});


        process.exit(1);
    }
}


// ============================================================
// WEBSOCKET
// ============================================================

function setupWebSocket() {

    websocketServer.on(
        "connection",
        (socket) => {

            console.log(
                "New connection"
            );


            socket.authenticated =
                false;

            socket.username =
                null;

            socket.roomKey =
                null;


            // ==================================================
            // MESSAGE RECEIVER
            // ==================================================

            socket.on(
                "message",
                async (rawMessage) => {

                    try {

                        const data =
                            JSON.parse(
                                rawMessage.toString()
                            );


                        // ==================================================
                        // LOGIN
                        // ==================================================

                        if (
                            data.type ===
                            "login"
                        ) {

                            if (
                                socket.authenticated
                            ) {

                                sendJSON(
                                    socket,
                                    {
                                        type:
                                            "login",

                                        success:
                                            false,

                                        error:
                                            "You are already logged in.",
                                    }
                                );

                                return;
                            }


                            const username =
                                String(
                                    data.username ||
                                    ""
                                ).trim();


                            const roomKey =
                                String(
                                    data.roomKey ||
                                    ""
                                ).trim();


                            if (
                                username ===
                                ""
                            ) {

                                sendJSON(
                                    socket,
                                    {
                                        type:
                                            "login",

                                        success:
                                            false,

                                        error:
                                            "Please enter a username.",
                                    }
                                );

                                return;
                            }


                            if (
                                username.length >
                                30
                            ) {

                                sendJSON(
                                    socket,
                                    {
                                        type:
                                            "login",

                                        success:
                                            false,

                                        error:
                                            "Username is too long.",
                                    }
                                );

                                return;
                            }


                            if (
                                !VALID_ROOM_KEYS.has(
                                    roomKey
                                )
                            ) {

                                sendJSON(
                                    socket,
                                    {
                                        type:
                                            "login",

                                        success:
                                            false,

                                        error:
                                            "Invalid channel key.",
                                    }
                                );

                                return;
                            }


                            // ==================================================
                            // LOAD MESSAGE HISTORY
                            // ==================================================

                            let history;


                            try {

                                history =
                                    await pool.query(
                                        `
                                            SELECT

                                                m.id,

                                                m.username,

                                                m.message,

                                                m.reply_to,

                                                m.created_at,

                                                m.edited_at,


                                                CASE

                                                    WHEN replied.id IS NOT NULL

                                                    THEN json_build_object(

                                                        'id',
                                                        replied.id,

                                                        'username',
                                                        replied.username,

                                                        'message',
                                                        replied.message

                                                    )

                                                    ELSE NULL

                                                END AS reply,


                                                COALESCE(

                                                    (

                                                        SELECT
                                                            json_object_agg(
                                                                r.reaction,
                                                                r.count
                                                            )

                                                        FROM (

                                                            SELECT
                                                                reaction,

                                                                COUNT(*)::int
                                                                    AS count

                                                            FROM
                                                                public.message_reactions

                                                            WHERE
                                                                message_id =
                                                                    m.id

                                                            GROUP BY
                                                                reaction

                                                        ) r

                                                    ),

                                                    '{}'::json

                                                ) AS reactions


                                            FROM
                                                public.messages m


                                            LEFT JOIN
                                                public.messages replied

                                            ON
                                                replied.id =
                                                    m.reply_to


                                            WHERE
                                                m.room_key =
                                                    $1


                                            ORDER BY
                                                m.id DESC


                                            LIMIT 100
                                        `,
                                        [
                                            roomKey,
                                        ]
                                    );


                            } catch (error) {

                                console.error(
                                    "History database error:",
                                    error
                                );


                                sendJSON(
                                    socket,
                                    {
                                        type:
                                            "login",

                                        success:
                                            false,

                                        error:
                                            "Unable to load chat history.",
                                    }
                                );


                                return;
                            }


                            socket.authenticated =
                                true;

                            socket.username =
                                username;

                            socket.roomKey =
                                roomKey;


                            console.log(
                                `${username} joined the private channel.`
                            );


                            sendJSON(
                                socket,
                                {
                                    type:
                                        "login",

                                    success:
                                        true,

                                    username,

                                    roomKey,
                                }
                            );


                            sendJSON(
                                socket,
                                {
                                    type:
                                        "history",

                                    messages:
                                        history.rows.reverse(),
                                }
                            );


                            return;
                        }


                        // ==================================================
                        // REQUIRE LOGIN
                        // ==================================================

                        if (
                            !socket.authenticated
                        ) {

                            sendJSON(
                                socket,
                                {
                                    type:
                                        "error",

                                    error:
                                        "You must enter the channel first.",
                                }
                            );

                            return;
                        }


                        // ==================================================
                        // TYPING
                        // ==================================================

                        if (
                            data.type ===
                            "typing"
                        ) {

                            websocketServer.clients.forEach(
                                (client) => {

                                    if (

                                        client !==
                                            socket &&

                                        client.readyState ===
                                            WebSocket.OPEN &&

                                        client.authenticated &&

                                        client.roomKey ===
                                            socket.roomKey

                                    ) {

                                        sendJSON(
                                            client,
                                            {
                                                type:
                                                    "typing",

                                                username:
                                                    socket.username,

                                                typing:
                                                    Boolean(
                                                        data.typing
                                                    ),
                                            }
                                        );
                                    }
                                }
                            );


                            return;
                        }


                        // ==================================================
                        // MESSAGE / REPLY
                        // ==================================================

                        if (
                            data.type ===
                            "message"
                        ) {

                            const messageText =
                                String(
                                    data.message ||
                                    ""
                                ).trim();


                            if (
                                messageText ===
                                ""
                            ) {

                                return;
                            }


                            if (
                                messageText.length >
                                2000
                            ) {

                                sendJSON(
                                    socket,
                                    {
                                        type:
                                            "error",

                                        error:
                                            "Message is too long.",
                                    }
                                );

                                return;
                            }


                            let replyTo = null;


                            if (

                                data.replyTo !==
                                    null &&

                                data.replyTo !==
                                    undefined &&

                                data.replyTo !==
                                    ""

                            ) {

                                replyTo =
                                    Number(
                                        data.replyTo
                                    );


                                if (

                                    !Number.isInteger(
                                        replyTo
                                    ) ||

                                    replyTo <=
                                        0

                                ) {

                                    sendJSON(
                                        socket,
                                        {
                                            type:
                                                "error",

                                            error:
                                                "Invalid reply message.",
                                        }
                                    );

                                    return;
                                }


                                const replyExists =
                                    await messageBelongsToRoom(
                                        replyTo,
                                        socket.roomKey
                                    );


                                if (
                                    !replyExists
                                ) {

                                    sendJSON(
                                        socket,
                                        {
                                            type:
                                                "error",

                                            error:
                                                "The message you are replying to does not exist.",
                                        }
                                    );

                                    return;
                                }
                            }


                            // ==================================================
                            // SAVE MESSAGE
                            // ==================================================

                            const result =
                                await pool.query(
                                    `
                                        INSERT INTO
                                            public.messages
                                        (
                                            username,
                                            message,
                                            room_key,
                                            reply_to
                                        )

                                        VALUES
                                        (
                                            $1,
                                            $2,
                                            $3,
                                            $4
                                        )

                                        RETURNING

                                            id,

                                            username,

                                            message,

                                            reply_to,

                                            created_at,

                                            room_key
                                    `,
                                    [
                                        socket.username,

                                        messageText,

                                        socket.roomKey,

                                        replyTo,
                                    ]
                                );


                            const message =
                                result.rows[0];


                            console.log(
                                `Message saved: ${message.username}: ${message.message}`
                            );


                            // ==================================================
                            // REPLY INFORMATION
                            // ==================================================

                            let reply = null;


                            if (
                                message.reply_to !==
                                null
                            ) {

                                const replyResult =
                                    await pool.query(
                                        `
                                            SELECT

                                                id,

                                                username,

                                                message

                                            FROM
                                                public.messages

                                            WHERE
                                                id = $1

                                            LIMIT 1
                                        `,
                                        [
                                            message.reply_to,
                                        ]
                                    );


                                if (
                                    replyResult.rowCount >
                                    0
                                ) {

                                    reply =
                                        replyResult.rows[0];
                                }
                            }


                            // ==================================================
                            // BROADCAST
                            // ==================================================

                            broadcastToRoom(
                                socket.roomKey,
                                {
                                    type:
                                        "message",

                                    id:
                                        message.id,

                                    username:
                                        message.username,

                                    message:
                                        message.message,

                                    reply_to:
                                        message.reply_to,

                                    created_at:
                                        message.created_at,

                                    edited_at:
                                        null,

                                    room_key:
                                        message.room_key,

                                    reply,

                                    reactions:
                                        {},
                                }
                            );


                            return;
                        }


                        // ==================================================
                        // EDIT MESSAGE
                        // ==================================================

                        if (
                            data.type ===
                            "edit_message"
                        ) {

                            const messageId =
                                Number(
                                    data.messageId
                                );


                            const messageText =
                                String(
                                    data.message ||
                                    ""
                                ).trim();


                            if (

                                !Number.isInteger(
                                    messageId
                                ) ||

                                messageId <=
                                    0

                            ) {

                                sendJSON(
                                    socket,
                                    {
                                        type:
                                            "error",

                                        error:
                                            "Invalid message ID.",
                                    }
                                );

                                return;
                            }


                            if (
                                messageText ===
                                ""
                            ) {

                                sendJSON(
                                    socket,
                                    {
                                        type:
                                            "error",

                                        error:
                                            "Message cannot be empty.",
                                    }
                                );

                                return;
                            }


                            if (
                                messageText.length >
                                2000
                            ) {

                                sendJSON(
                                    socket,
                                    {
                                        type:
                                            "error",

                                        error:
                                            "Message is too long.",
                                    }
                                );

                                return;
                            }


                            // ==================================================
                            // CHECK MESSAGE
                            // ==================================================

                            const existingMessage =
                                await pool.query(
                                    `
                                        SELECT

                                            id,

                                            username,

                                            room_key,

                                            reply_to

                                        FROM
                                            public.messages

                                        WHERE
                                            id = $1

                                            AND room_key = $2

                                        LIMIT 1
                                    `,
                                    [
                                        messageId,

                                        socket.roomKey,
                                    ]
                                );


                            if (
                                existingMessage.rowCount ===
                                0
                            ) {

                                sendJSON(
                                    socket,
                                    {
                                        type:
                                            "error",

                                        error:
                                            "Message not found.",
                                    }
                                );

                                return;
                            }


                            if (
                                existingMessage.rows[0]
                                    .username !==
                                socket.username
                            ) {

                                sendJSON(
                                    socket,
                                    {
                                        type:
                                            "error",

                                        error:
                                            "You can only edit your own messages.",
                                    }
                                );

                                return;
                            }


                            // ==================================================
                            // UPDATE
                            // ==================================================

                            const result =
                                await pool.query(
                                    `
                                        UPDATE
                                            public.messages

                                        SET

                                            message =
                                                $1,

                                            edited_at =
                                                NOW()

                                        WHERE

                                            id =
                                                $2

                                            AND room_key =
                                                $3

                                            AND username =
                                                $4

                                        RETURNING

                                            id,

                                            username,

                                            message,

                                            reply_to,

                                            created_at,

                                            edited_at,

                                            room_key
                                    `,
                                    [
                                        messageText,

                                        messageId,

                                        socket.roomKey,

                                        socket.username,
                                    ]
                                );


                            if (
                                result.rowCount ===
                                0
                            ) {

                                sendJSON(
                                    socket,
                                    {
                                        type:
                                            "error",

                                        error:
                                            "Unable to edit message.",
                                    }
                                );

                                return;
                            }


                            const editedMessage =
                                result.rows[0];


                            // ==================================================
                            // REPLY PREVIEW
                            // ==================================================

                            let reply = null;


                            if (
                                editedMessage.reply_to !==
                                null
                            ) {

                                const replyResult =
                                    await pool.query(
                                        `
                                            SELECT

                                                id,

                                                username,

                                                message

                                            FROM
                                                public.messages

                                            WHERE
                                                id = $1

                                            LIMIT 1
                                        `,
                                        [
                                            editedMessage.reply_to,
                                        ]
                                    );


                                if (
                                    replyResult.rowCount >
                                    0
                                ) {

                                    reply =
                                        replyResult.rows[0];
                                }
                            }


                            // ==================================================
                            // REACTIONS
                            // ==================================================

                            const reactions =
                                await getReactionCounts(
                                    messageId
                                );


                            // ==================================================
                            // BROADCAST EDIT
                            // ==================================================

                            broadcastToRoom(
                                socket.roomKey,
                                {
                                    type:
                                        "message_edited",

                                    id:
                                        editedMessage.id,

                                    username:
                                        editedMessage.username,

                                    message:
                                        editedMessage.message,

                                    reply_to:
                                        editedMessage.reply_to,

                                    reply,

                                    created_at:
                                        editedMessage.created_at,

                                    edited_at:
                                        editedMessage.edited_at,

                                    room_key:
                                        editedMessage.room_key,

                                    reactions,
                                }
                            );


                            console.log(
                                `${socket.username} edited message ${messageId}`
                            );


                            return;
                        }


                        // ==================================================
                        // REACTION
                        // ==================================================

                        if (
                            data.type ===
                            "reaction"
                        ) {

                            const messageId =
                                Number(
                                    data.messageId
                                );


                            const reaction =
                                String(
                                    data.reaction ||
                                    ""
                                ).trim();


                            // ==================================================
                            // VALIDATE MESSAGE ID
                            // ==================================================

                            if (

                                !Number.isInteger(
                                    messageId
                                ) ||

                                messageId <=
                                    0

                            ) {

                                sendJSON(
                                    socket,
                                    {
                                        type:
                                            "error",

                                        error:
                                            "Invalid message ID.",
                                    }
                                );

                                return;
                            }


                            // ==================================================
                            // VALIDATE REACTION
                            // ==================================================

                            if (
                                !ALLOWED_REACTIONS.has(
                                    reaction
                                )
                            ) {

                                sendJSON(
                                    socket,
                                    {
                                        type:
                                            "error",

                                        error:
                                            "Invalid reaction.",
                                    }
                                );

                                return;
                            }


                            // ==================================================
                            // VERIFY MESSAGE
                            // ==================================================

                            const messageExists =
                                await messageBelongsToRoom(
                                    messageId,
                                    socket.roomKey
                                );


                            if (
                                !messageExists
                            ) {

                                sendJSON(
                                    socket,
                                    {
                                        type:
                                            "error",

                                        error:
                                            "Message not found.",
                                    }
                                );

                                return;
                            }


                            // ==================================================
                            // CHECK THIS USER'S REACTION
                            // ==================================================

                            const existingReaction =
                                await pool.query(
                                    `
                                        SELECT

                                            id,

                                            reaction

                                        FROM
                                            public.message_reactions

                                        WHERE

                                            message_id =
                                                $1

                                            AND username =
                                                $2

                                            AND reaction =
                                                $3

                                        LIMIT 1
                                    `,
                                    [
                                        messageId,

                                        socket.username,

                                        reaction,
                                    ]
                                );


                            // ==================================================
                            // SAME REACTION EXISTS
                            // REMOVE IT
                            // ==================================================

                            if (
                                existingReaction.rowCount >
                                0
                            ) {

                                await pool.query(
                                    `
                                        DELETE FROM
                                            public.message_reactions

                                        WHERE
                                            id = $1
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
                            }


                            // ==================================================
                            // REACTION DOES NOT EXIST
                            // ADD IT
                            // ==================================================

                            else {

                                await pool.query(
                                    `
                                        INSERT INTO
                                            public.message_reactions
                                        (
                                            message_id,

                                            username,

                                            reaction
                                        )

                                        VALUES
                                        (
                                            $1,

                                            $2,

                                            $3
                                        )

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


                            // ==================================================
                            // GET UPDATED COUNTS
                            // ==================================================

                            const reactions =
                                await getReactionCounts(
                                    messageId
                                );


                            // ==================================================
                            // GET USERS
                            // ==================================================

                            const reactionUsers =
                                await getReactionUsers(
                                    messageId
                                );


                            // ==================================================
                            // BROADCAST
                            // ==================================================

                            broadcastToRoom(
                                socket.roomKey,
                                {
                                    type:
                                        "reaction",

                                    messageId,

                                    reactions,

                                    reactionUsers,
                                }
                            );


                            return;
                        }


                        // ==================================================
                        // UNKNOWN REQUEST
                        // ==================================================

                        sendJSON(
                            socket,
                            {
                                type:
                                    "error",

                                error:
                                    "Unknown request.",
                            }
                        );


                    } catch (error) {

                        console.error(
                            "Request error:",
                            error
                        );


                        sendJSON(
                            socket,
                            {
                                type:
                                    "error",

                                error:
                                    "Server error.",
                            }
                        );
                    }
                }
            );


            // ==================================================
            // CONNECTION CLOSED
            // ==================================================

            socket.on(
                "close",
                () => {

                    if (
                        socket.username
                    ) {

                        console.log(
                            `${socket.username} left the private channel.`
                        );
                    }
                }
            );


            // ==================================================
            // WEBSOCKET ERROR
            // ==================================================

            socket.on(
                "error",
                (error) => {

                    console.error(
                        "WebSocket error:",
                        error
                    );
                }
            );
        }
    );
}


// ============================================================
// SHUTDOWN
// ============================================================

async function shutdown(
    signal
) {

    console.log(
        `${signal} received. Shutting down...`
    );


    if (
        websocketServer
    ) {

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


    if (
        httpServer
    ) {

        await new Promise(
            (resolve) => {

                httpServer.close(
                    resolve
                );
            }
        );
    }


    await pool.end();


    console.log(
        "Server shut down cleanly."
    );


    process.exit(0);
}


// ============================================================
// PROCESS SIGNALS
// ============================================================

process.on(
    "SIGINT",
    () =>
        shutdown("SIGINT")
);


process.on(
    "SIGTERM",
    () =>
        shutdown("SIGTERM")
);


// ============================================================
// START
// ============================================================

startServer();
