require("dotenv").config();

const express = require("express");
const WebSocket = require("ws");
const { Pool } = require("pg");

// ============================================================
// Configuration
// ============================================================

const PORT =
    Number(process.env.PORT) || 8080;

const ROOM_KEY =
    process.env.CHAT_ROOM_KEY;


if (!ROOM_KEY) {

    console.error(
        "ERROR: CHAT_ROOM_KEY is not set."
    );

    process.exit(1);
}


// ============================================================
// Database
// ============================================================

const pool =
    new Pool({

        connectionString:
            process.env.DATABASE_URL,

        ssl:
            process.env.NODE_ENV === "production"
                ? {
                    rejectUnauthorized: false
                }
                : false,

        max: 10,

        idleTimeoutMillis:
            30000,

        connectionTimeoutMillis:
            10000

    });


// ============================================================
// Initialize database
// ============================================================

async function initializeDatabase() {

    await pool.query(`
        CREATE TABLE IF NOT EXISTS messages (
            id BIGSERIAL PRIMARY KEY,

            username TEXT NOT NULL,

            message TEXT NOT NULL,

            created_at TIMESTAMPTZ NOT NULL
                DEFAULT NOW()
        )
    `);


    console.log(
        "Database connected"
    );

}


// ============================================================
// Express
// ============================================================

const app =
    express();

app.disable(
    "x-powered-by"
);


app.use(
    express.static(__dirname)
);


// ============================================================
// Health check
// ============================================================

app.get(
    "/health",
    async (req, res) => {

        try {

            await pool.query(
                "SELECT 1"
            );


            res.json({

                status:
                    "ok",

                database:
                    "ok"

            });

        } catch (error) {

            console.error(
                "Health check error:",
                error
            );


            res.status(503).json({

                status:
                    "error",

                database:
                    "unavailable"

            });

        }

    }
);


// ============================================================
// WebSocket helper
// ============================================================

function sendJSON(
    socket,
    data
) {

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
// HTTP server
// ============================================================

let httpServer;
let websocketServer;


// ============================================================
// Start server
// ============================================================

async function startServer() {

    try {

        // ----------------------------------------------------
        // Make sure database works BEFORE accepting clients
        // ----------------------------------------------------

        await initializeDatabase();


        // ----------------------------------------------------
        // Start HTTP server
        // ----------------------------------------------------

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


        // ----------------------------------------------------
        // WebSocket server
        // ----------------------------------------------------

        websocketServer =
            new WebSocket.Server({

                server:
                    httpServer,

                maxPayload:
                    64 * 1024

            });


        setupWebSocket();


    } catch (error) {

        console.error(
            "Failed to start server:",
            error
        );


        await pool.end()
            .catch(() => {});


        process.exit(1);

    }

}


// ============================================================
// WebSocket
// ============================================================

function setupWebSocket() {

    websocketServer.on(
        "connection",
        (socket) => {

            console.log(
                "New connection"
            );


            // ------------------------------------------------
            // User state
            // ------------------------------------------------

            socket.authenticated =
                false;

            socket.username =
                null;


            // ------------------------------------------------
            // Receive data
            // ------------------------------------------------

            socket.on(
                "message",
                async (rawMessage) => {

                    try {

                        const data =
                            JSON.parse(
                                rawMessage.toString()
                            );


                        // ====================================
                        // LOGIN
                        // ====================================

                        if (
                            data.type ===
                            "login"
                        ) {

                            // Don't allow login twice.

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
                                            "You are already logged in."
                                    }
                                );

                                return;
                            }


                            const username =
                                String(
                                    data.username || ""
                                ).trim();


                            const roomKey =
                                String(
                                    data.roomKey || ""
                                ).trim();


                            // --------------------------------
                            // Validate username
                            // --------------------------------

                            if (
                                username === ""
                            ) {

                                sendJSON(
                                    socket,
                                    {
                                        type:
                                            "login",

                                        success:
                                            false,

                                        error:
                                            "Please enter a username."
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
                                            "Username is too long."
                                    }
                                );

                                return;
                            }


                            // --------------------------------
                            // Validate room key
                            // --------------------------------

                            if (
                                roomKey !==
                                ROOM_KEY
                            ) {

                                sendJSON(
                                    socket,
                                    {
                                        type:
                                            "login",

                                        success:
                                            false,

                                        error:
                                            "Incorrect channel key."
                                    }
                                );

                                return;
                            }


                            // --------------------------------
                            // Get history FIRST
                            // --------------------------------

                            let history;


                            try {

                                history =
                                    await pool.query(`
                                        SELECT
                                            id,
                                            username,
                                            message,
                                            created_at
                                        FROM messages
                                        ORDER BY id DESC
                                        LIMIT 100
                                    `);

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
                                            "Unable to load chat history."
                                    }
                                );

                                return;
                            }


                            // --------------------------------
                            // Authenticate
                            // --------------------------------

                            socket.authenticated =
                                true;

                            socket.username =
                                username;


                            console.log(
                                `${username} joined the private channel.`
                            );


                            // --------------------------------
                            // Login success FIRST
                            // --------------------------------

                            sendJSON(
                                socket,
                                {
                                    type:
                                        "login",

                                    success:
                                        true,

                                    username:
                                        username
                                }
                            );


                            // --------------------------------
                            // History SECOND
                            // --------------------------------

                            sendJSON(
                                socket,
                                {
                                    type:
                                        "history",

                                    messages:
                                        history.rows.reverse()
                                }
                            );


                            return;

                        }


                        // ====================================
                        // REQUIRE LOGIN
                        // ====================================

                        if (
                            !socket.authenticated
                        ) {

                            sendJSON(
                                socket,
                                {
                                    type:
                                        "error",

                                    error:
                                        "You must enter the channel first."
                                }
                            );

                            return;
                        }


                        // ====================================
                        // TYPING
                        // ====================================

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

                                        client.authenticated

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
                                                    )

                                            }
                                        );

                                    }

                                }
                            );


                            return;

                        }


                        // ====================================
                        // CHAT MESSAGE
                        // ====================================

                        if (
                            data.type ===
                            "message"
                        ) {

                            const messageText =
                                String(
                                    data.message || ""
                                ).trim();


                            // Empty message

                            if (
                                messageText === ""
                            ) {

                                return;

                            }


                            // Too long

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
                                            "Message is too long."

                                    }
                                );

                                return;

                            }


                            // --------------------------------
                            // Save to PostgreSQL
                            // --------------------------------

                            const result =
                                await pool.query(
                                    `
                                    INSERT INTO messages
                                        (
                                            username,
                                            message
                                        )
                                    VALUES
                                        (
                                            $1,
                                            $2
                                        )
                                    RETURNING
                                        id,
                                        username,
                                        message,
                                        created_at
                                    `,
                                    [
                                        socket.username,
                                        messageText
                                    ]
                                );


                            const message =
                                result.rows[0];


                            console.log(
                                `Message saved: ${message.username}: ${message.message}`
                            );


                            // --------------------------------
                            // Broadcast
                            // --------------------------------

                            websocketServer.clients.forEach(
                                (client) => {

                                    if (

                                        client.readyState ===
                                            WebSocket.OPEN &&

                                        client.authenticated

                                    ) {

                                        sendJSON(
                                            client,
                                            {

                                                type:
                                                    "message",

                                                id:
                                                    message.id,

                                                username:
                                                    message.username,

                                                message:
                                                    message.message,

                                                // created_at:
                                                //     message.created_at

                                            }
                                        );

                                    }

                                }
                            );


                            return;

                        }


                        // ====================================
                        // UNKNOWN REQUEST
                        // ====================================

                        sendJSON(
                            socket,
                            {

                                type:
                                    "error",

                                error:
                                    "Unknown request."

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
                                    "Server error."

                            }
                        );

                    }

                }
            );


            // ------------------------------------------------
            // Disconnect
            // ------------------------------------------------

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


            // ------------------------------------------------
            // Error
            // ------------------------------------------------

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
// Graceful shutdown
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


process.on(
    "SIGINT",
    () => shutdown("SIGINT")
);

process.on(
    "SIGTERM",
    () => shutdown("SIGTERM")
);


// ============================================================
// Start
// ============================================================

startServer();
