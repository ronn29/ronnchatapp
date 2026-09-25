// ============================================================
// Get elements
// ============================================================

const usernameContainer =
    document.getElementById("usernameContainer");

const usernameInput =
    document.getElementById("usernameInput");

const roomKeyInput =
    document.getElementById("roomKeyInput");

const usernameButton =
    document.getElementById("usernameButton");

const loginError =
    document.getElementById("loginError");

const chatContainer =
    document.getElementById("chatContainer");

const currentUsername =
    document.getElementById("currentUsername");

const connectionStatus =
    document.getElementById("connectionStatus");

const messages =
    document.getElementById("messages");

const input =
    document.getElementById("messageInput");

const button =
    document.getElementById("sendButton");

const typingIndicator =
    document.getElementById("typingIndicator");


// ============================================================
// User state
// ============================================================

let username = "";
let authenticated = false;


// ============================================================
// Typing state
// ============================================================

let typingTimeout = null;


// ============================================================
// Automatically saved login
// ============================================================

const savedUsername =
    localStorage.getItem("chatUsername");

const savedRoomKey =
    localStorage.getItem("chatRoomKey");


// ============================================================
// WebSocket
// ============================================================

const socket =
    new WebSocket(
        `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}`
    );


// ============================================================
// Connection opened
// ============================================================

socket.onopen = () => {

    console.log(
        "WebSocket connected"
    );


    connectionStatus.textContent =
        "● Connected";

    connectionStatus.classList.remove(
        "disconnected"
    );

    connectionStatus.classList.add(
        "connected"
    );


    // --------------------------------------------------------
    // Restore previous login
    // --------------------------------------------------------

    if (
        savedUsername &&
        savedRoomKey
    ) {

        usernameInput.value =
            savedUsername;

        roomKeyInput.value =
            savedRoomKey;


        loginError.textContent =
            "Reconnecting...";


        socket.send(
            JSON.stringify({

                type:
                    "login",

                username:
                    savedUsername,

                roomKey:
                    savedRoomKey

            })
        );

    }

};


// ============================================================
// Receive WebSocket messages
// ============================================================

socket.onmessage = (event) => {

    try {

        const data =
            JSON.parse(
                event.data
            );


        console.log(
            "SERVER:",
            data
        );


        // ====================================================
        // LOGIN
        // ====================================================

        if (
            data.type ===
            "login"
        ) {

            if (
                data.success
            ) {

                authenticated =
                    true;

                username =
                    data.username;


                console.log(
                    "Authenticated:",
                    username
                );


                currentUsername.textContent =
                    `Logged in as ${username}`;


                usernameContainer.style.display =
                    "none";


                chatContainer.style.display =
                    "flex";


                loginError.textContent =
                    "";


                // Save credentials

                localStorage.setItem(
                    "chatUsername",
                    username
                );

                localStorage.setItem(
                    "chatRoomKey",
                    roomKeyInput.value.trim()
                );


                input.focus();

            } else {

                authenticated =
                    false;


                loginError.textContent =
                    data.error ||
                    "Login failed.";


                localStorage.removeItem(
                    "chatUsername"
                );

                localStorage.removeItem(
                    "chatRoomKey"
                );

            }


            return;

        }


        // ====================================================
        // HISTORY
        // ====================================================

        if (
            data.type ===
            "history"
        ) {

            console.log(
                "Loading history:",
                data.messages
            );


            // Clear current messages

            messages.innerHTML =
                "";


            // Make sure messages is an array

            if (
                Array.isArray(
                    data.messages
                )
            ) {

                data.messages.forEach(
                    (message) => {

                        addMessage(
                            message.username,
                            message.message,
                            message.created_at
                        );

                    }
                );

            }


            // Scroll to bottom

            messages.scrollTop =
                messages.scrollHeight;


            return;

        }


        // ====================================================
        // NEW MESSAGE
        // ====================================================

        if (
            data.type ===
            "message"
        ) {

            console.log(
                "New message:",
                data
            );


            addMessage(
                data.username,
                data.message,
                data.created_at
            );


            return;

        }


        // ====================================================
        // TYPING
        // ====================================================

        if (
            data.type ===
            "typing"
        ) {

            if (
                data.typing
            ) {

                typingIndicator.textContent =
                    `${data.username} is typing...`;

            } else {

                typingIndicator.textContent =
                    "";

            }


            return;

        }


        // ====================================================
        // ERROR
        // ====================================================

        if (
            data.type ===
            "error"
        ) {

            console.error(
                "Server error:",
                data.error
            );


            return;

        }

    } catch (error) {

        console.error(
            "Failed to process server message:",
            error
        );

    }

};


// ============================================================
// Add message to UI
// ============================================================

function addMessage(
    senderName,
    messageText,
    createdAt
) {

    const messageDiv =
        document.createElement("div");


    // --------------------------------------------------------
    // Sender / receiver
    // --------------------------------------------------------

    messageDiv.classList.add(
        "message"
    );


    if (
        senderName ===
        username
    ) {

        messageDiv.classList.add(
            "sender"
        );

    } else {

        messageDiv.classList.add(
            "receiver"
        );

    }


    // --------------------------------------------------------
    // Username
    // --------------------------------------------------------

    const usernameElement =
        document.createElement("span");

    usernameElement.classList.add(
        "username"
    );

    usernameElement.textContent =
        senderName;


    // --------------------------------------------------------
    // Message
    // --------------------------------------------------------

    const messageElement =
        document.createElement("p");

    messageElement.textContent =
        messageText;


    // --------------------------------------------------------
    // Time
    // --------------------------------------------------------

    const timeElement =
        document.createElement("small");

    timeElement.classList.add(
        "message-time"
    );


    if (
        createdAt
    ) {

        const date =
            new Date(
                createdAt
            );


        if (
            !Number.isNaN(
                date.getTime()
            )
        ) {

            timeElement.textContent =
                date.toLocaleTimeString(
                    [],
                    {
                        hour:
                            "2-digit",

                        minute:
                            "2-digit"
                    }
                );

        }

    }


    // --------------------------------------------------------
    // Build
    // --------------------------------------------------------

    messageDiv.appendChild(
        usernameElement
    );

    messageDiv.appendChild(
        messageElement
    );

    messageDiv.appendChild(
        timeElement
    );


    // --------------------------------------------------------
    // Add
    // --------------------------------------------------------

    messages.appendChild(
        messageDiv
    );


    // --------------------------------------------------------
    // Scroll
    // --------------------------------------------------------

    messages.scrollTop =
        messages.scrollHeight;

}


// ============================================================
// Login
// ============================================================

function joinChat() {

    const enteredUsername =
        usernameInput.value.trim();

    const roomKey =
        roomKeyInput.value.trim();


    if (
        enteredUsername === ""
    ) {

        loginError.textContent =
            "Please enter a username.";

        usernameInput.focus();

        return;

    }


    if (
        roomKey === ""
    ) {

        loginError.textContent =
            "Please enter the channel key.";

        roomKeyInput.focus();

        return;

    }


    if (
        socket.readyState !==
        WebSocket.OPEN
    ) {

        loginError.textContent =
            "Not connected to the server.";

        return;

    }


    loginError.textContent =
        "Checking channel key...";


    socket.send(
        JSON.stringify({

            type:
                "login",

            username:
                enteredUsername,

            roomKey:
                roomKey

        })
    );

}


// ============================================================
// Send message
// ============================================================

function sendMessage() {

    const message =
        input.value.trim();


    if (
        message === ""
    ) {
        return;
    }


    if (
        !authenticated
    ) {

        console.error(
            "Cannot send message: not authenticated"
        );

        return;

    }


    if (
        socket.readyState !==
        WebSocket.OPEN
    ) {

        console.error(
            "Cannot send message: WebSocket not connected"
        );

        return;

    }


    console.log(
        "Sending message:",
        message
    );


    // Stop typing

    clearTimeout(
        typingTimeout
    );


    socket.send(
        JSON.stringify({

            type:
                "typing",

            typing:
                false

        })
    );


    // Send actual message

    socket.send(
        JSON.stringify({

            type:
                "message",

            message:
                message

        })
    );


    // Clear input

    input.value =
        "";

    input.style.height =
        "40px";

    input.focus();

}


// ============================================================
// Login button
// ============================================================

usernameButton.addEventListener(
    "click",
    joinChat
);


// ============================================================
// Send button
// ============================================================

button.addEventListener(
    "click",
    sendMessage
);


// ============================================================
// Username Enter
// ============================================================

usernameInput.addEventListener(
    "keydown",
    (event) => {

        if (
            event.key ===
            "Enter"
        ) {

            event.preventDefault();

            joinChat();

        }

    }
);


// ============================================================
// Room key Enter
// ============================================================

roomKeyInput.addEventListener(
    "keydown",
    (event) => {

        if (
            event.key ===
            "Enter"
        ) {

            event.preventDefault();

            joinChat();

        }

    }
);


// ============================================================
// Message Enter
// ============================================================

input.addEventListener(
    "keydown",
    (event) => {

        if (
            event.key === "Enter" &&
            !event.shiftKey
        ) {

            event.preventDefault();

            sendMessage();

        }

    }
);


// ============================================================
// Typing + textarea resize
// ============================================================

input.addEventListener(
    "input",
    () => {

        // ----------------------------------------------------
        // Resize
        // ----------------------------------------------------

        input.style.height =
            "auto";

        input.style.height =
            Math.min(
                input.scrollHeight,
                120
            ) + "px";


        // ----------------------------------------------------
        // Typing
        // ----------------------------------------------------

        if (
            !authenticated
        ) {
            return;
        }


        if (
            socket.readyState !==
            WebSocket.OPEN
        ) {
            return;
        }


        socket.send(
            JSON.stringify({

                type:
                    "typing",

                typing:
                    true

            })
        );


        clearTimeout(
            typingTimeout
        );


        typingTimeout =
            setTimeout(
                () => {

                    if (
                        socket.readyState ===
                        WebSocket.OPEN
                    ) {

                        socket.send(
                            JSON.stringify({

                                type:
                                    "typing",

                                typing:
                                    false

                            })
                        );

                    }

                },
                1000
            );

    }
);


// ============================================================
// Disconnect
// ============================================================

socket.onclose = () => {

    console.log(
        "WebSocket disconnected"
    );


    authenticated =
        false;


    typingIndicator.textContent =
        "";


    connectionStatus.textContent =
        "● Offline";


    connectionStatus.classList.remove(
        "connected"
    );

    connectionStatus.classList.add(
        "disconnected"
    );

};


// ============================================================
// WebSocket error
// ============================================================

socket.onerror = (error) => {

    console.error(
        "WebSocket error:",
        error
    );


    connectionStatus.textContent =
        "● Connection error";


    connectionStatus.classList.remove(
        "connected"
    );

    connectionStatus.classList.add(
        "disconnected"
    );

};


// dark mode
const themeToggle = document.getElementById("themeToggle");

const savedTheme = localStorage.getItem("theme");

if (savedTheme === "dark") {
    document.body.classList.add("dark-mode");
    themeToggle.textContent = "☀️";
}

themeToggle.addEventListener("click", () => {
    document.body.classList.toggle("dark-mode");

    const darkMode = document.body.classList.contains("dark-mode");

    localStorage.setItem(
        "theme",
        darkMode ? "dark" : "light"
    );

    themeToggle.textContent = darkMode
        ? "☀️"
        : "🌙";
});
