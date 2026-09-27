// ============================================================
// ELEMENTS
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

const themeToggle =
    document.getElementById("themeToggle");


// ============================================================
// USER STATE
// ============================================================

let username = "";

let authenticated = false;


// ============================================================
// TYPING STATE
// ============================================================

let typingTimeout = null;


// ============================================================
// REPLY STATE
// ============================================================

let replyingToMessage = null;


// ============================================================
// SAVED LOGIN
// ============================================================

const savedUsername =
    localStorage.getItem("chatUsername");

const savedRoomKey =
    localStorage.getItem("chatRoomKey");


// ============================================================
// WEBSOCKET
// ============================================================

const socket =
    new WebSocket(
        `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}`
    );


// ============================================================
// CONNECTION OPEN
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
    // Restore login
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
                    savedRoomKey,

            })
        );

    }

};


// ============================================================
// RECEIVE WEBSOCKET DATA
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
            data.type === "login"
        ) {

            handleLoginResponse(
                data
            );

            return;

        }


        // ====================================================
        // HISTORY
        // ====================================================

        if (
            data.type === "history"
        ) {

            handleHistory(
                data
            );

            return;

        }


        // ====================================================
        // NEW MESSAGE
        // ====================================================

        if (
            data.type === "message"
        ) {

            addMessage(
                data
            );

            return;

        }


        // ====================================================
        // REACTION UPDATE
        // ====================================================

        if (
            data.type === "reaction"
        ) {

            updateMessageReactions(
                data
            );

            return;

        }


        // ====================================================
        // TYPING
        // ====================================================

        if (
            data.type === "typing"
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
            data.type === "error"
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
// LOGIN RESPONSE
// ============================================================

function handleLoginResponse(
    data
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


        // ----------------------------------------------------
        // Save login
        // ----------------------------------------------------

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

}


// ============================================================
// HISTORY
// ============================================================

function handleHistory(
    data
) {

    messages.innerHTML =
        "";


    if (
        !Array.isArray(
            data.messages
        )
    ) {

        return;

    }


    data.messages.forEach(
        (message) => {

            addMessage(
                message,
                false
            );

        }
    );


    messages.scrollTop =
        messages.scrollHeight;

}


// ============================================================
// ADD MESSAGE
// ============================================================

function addMessage(
    message,
    scroll = true
) {

    /*
     * Prevent duplicate messages.
     *
     * This is useful because the same message should
     * only appear once in the UI.
     */

    if (
        document.querySelector(
            `[data-message-id="${message.id}"]`
        )
    ) {

        return;

    }


    // ========================================================
    // MESSAGE CONTAINER
    // ========================================================

    const messageDiv =
        document.createElement("div");


    messageDiv.classList.add(
        "message"
    );


    messageDiv.dataset.messageId =
        String(
            message.id
        );


    // ========================================================
    // SENDER / RECEIVER
    // ========================================================

    if (
        message.username ===
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


    // ========================================================
    // USERNAME
    // ========================================================

    const usernameElement =
        document.createElement("span");


    usernameElement.classList.add(
        "username"
    );


    usernameElement.textContent =
        message.username;


    // ========================================================
    // REPLY PREVIEW
    // ========================================================

    if (
        message.reply
    ) {

        const replyPreview =
            createReplyPreview(
                message.reply
            );


        messageDiv.appendChild(
            replyPreview
        );

    }


    // ========================================================
    // MESSAGE TEXT
    // ========================================================

    const messageElement =
        document.createElement("p");


    messageElement.textContent =
        message.message;


    // ========================================================
    // TIME
    // ========================================================

    const timeElement =
        document.createElement("small");


    timeElement.classList.add(
        "message-time"
    );


    if (
        message.created_at
    ) {

        const date =
            new Date(
                message.created_at
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
                            "2-digit",
                    }
                );

        }

    }


    // ========================================================
    // MESSAGE CONTENT
    // ========================================================

    messageDiv.appendChild(
        usernameElement
    );


    messageDiv.appendChild(
        messageElement
    );


    messageDiv.appendChild(
        timeElement
    );


    // ========================================================
    // REACTIONS
    // ========================================================

    const reactionContainer =
        createReactionContainer(
            message
        );


    messageDiv.appendChild(
        reactionContainer
    );


    // ========================================================
    // ACTIONS
    // ========================================================

    const actions =
        createMessageActions(
            message
        );


    messageDiv.appendChild(
        actions
    );


    // ========================================================
    // ADD TO DOM
    // ========================================================

    messages.appendChild(
        messageDiv
    );
    // ========================================================
// SHOW ACTIONS WHEN MESSAGE IS CLICKED
// ========================================================

messageDiv.addEventListener("click", (event) => {

    // Don't toggle the message menu when clicking
    // buttons or the reaction picker.
    if (
        event.target.closest(".message-actions") ||
        event.target.closest(".reaction-picker")
    ) {
        return;
    }

    // Close all other message action menus
    document
        .querySelectorAll(".message-actions.active")
        .forEach((item) => {

            if (item !== actions) {
                item.classList.remove("active");
            }

        });

    // Toggle this message's actions
    actions.classList.toggle("active");

});


    // ========================================================
    // SCROLL
    // ========================================================

    if (
        scroll
    ) {

        messages.scrollTop =
            messages.scrollHeight;

    }

}


// ============================================================
// CREATE REPLY PREVIEW
// ============================================================

function createReplyPreview(
    reply
) {

    const preview =
        document.createElement("div");


    preview.classList.add(
        "message-reply-preview"
    );


    preview.dataset.replyMessageId =
        String(
            reply.id
        );


    const name =
        document.createElement("div");


    name.classList.add(
        "message-reply-name"
    );


    name.textContent =
        `↩ ${reply.username}`;


    const text =
        document.createElement("div");


    text.classList.add(
        "message-reply-text"
    );


    text.textContent =
        reply.message;


    preview.appendChild(
        name
    );


    preview.appendChild(
        text
    );


    // --------------------------------------------------------
    // Click → jump to original message
    // --------------------------------------------------------

    preview.addEventListener(
        "click",
        () => {

            scrollToMessage(
                reply.id
            );

        }
    );


    return preview;

}


// ============================================================
// CREATE MESSAGE ACTIONS
// ============================================================

function createMessageActions(message) {

    const actions = document.createElement("div");

    actions.classList.add("message-actions");


    // ========================================================
    // REPLY BUTTON
    // ========================================================

    const replyButton = document.createElement("button");

    replyButton.type = "button";

    replyButton.classList.add("reply-button");

    replyButton.textContent = "↩ Reply";

    replyButton.addEventListener("click", (event) => {

        event.stopPropagation();

        startReply(message);

        actions.classList.remove("active");

    });


    actions.appendChild(replyButton);


    // ========================================================
    // REACT BUTTON
    // ========================================================

    const reactButton = document.createElement("button");

    reactButton.type = "button";

    reactButton.classList.add("react-button");

    reactButton.textContent = "😊 React";

    reactButton.addEventListener("click", (event) => {

        event.stopPropagation();

        toggleReactionPicker(
            messageDivFromButton(reactButton)
        );

    });


    actions.appendChild(reactButton);


    // ========================================================
    // REACTION PICKER
    // ========================================================

    const picker = createReactionPicker(message);

    actions.appendChild(picker);


    return actions;
}


// ============================================================
// GET MESSAGE DIV FROM BUTTON
// ============================================================

function messageDivFromButton(
    button
) {

    return button.closest(
        ".message"
    );

}


// ============================================================
// CREATE REACTION PICKER
// ============================================================

function createReactionPicker(
    message
) {

    const picker =
        document.createElement("div");


    picker.classList.add(
        "reaction-picker"
    );


    const reactions = [
        "👍",
        "❤️",
        "😂",
        "😮",
        "😢",
        "👎",
    ];


    reactions.forEach(
        (reaction) => {

            const choice =
                document.createElement("button");


            choice.type =
                "button";


            choice.classList.add(
                "reaction-choice"
            );


            choice.textContent =
                reaction;


            choice.title =
                `React ${reaction}`;


            choice.addEventListener(
                "click",
                (event) => {

                    event.stopPropagation();


                    sendReaction(
                        message.id,
                        reaction
                    );


                    picker.classList.remove(
                        "active"
                    );

                }
            );


            picker.appendChild(
                choice
            );

        }
    );


    return picker;

}


// ============================================================
// TOGGLE REACTION PICKER
// ============================================================

function toggleReactionPicker(
    messageDiv
) {

    const picker =
        messageDiv.querySelector(
            ".reaction-picker"
        );


    if (
        !picker
    ) {

        return;

    }


    const wasOpen =
        picker.classList.contains(
            "active"
        );


    // --------------------------------------------------------
    // Close every picker
    // --------------------------------------------------------

    document
        .querySelectorAll(
            ".reaction-picker.active"
        )
        .forEach(
            (item) => {

                item.classList.remove(
                    "active"
                );

            }
        );


    // --------------------------------------------------------
    // Open this one if it wasn't already open
    // --------------------------------------------------------

    if (
        !wasOpen
    ) {

        picker.classList.add(
            "active"
        );

    }

}


// ============================================================
// CREATE REACTION CONTAINER
// ============================================================

function createReactionContainer(
    message
) {

    const container =
        document.createElement("div");


    container.classList.add(
        "message-reactions"
    );


    renderReactions(
        container,
        message.id,
        message.reactions || {},
        message.reactionUsers || {}
    );


    return container;

}


// ============================================================
// RENDER REACTIONS
// ============================================================

function renderReactions(
    container,
    messageId,
    reactions,
    reactionUsers
) {

    container.innerHTML =
        "";


    if (
        !reactions ||
        typeof reactions !== "object"
    ) {

        return;

    }


    Object.entries(
        reactions
    ).forEach(
        ([reaction, count]) => {

            const button =
                document.createElement("button");


            button.type =
                "button";


            button.classList.add(
                "message-reaction"
            );


            button.textContent =
                `${reaction} ${count}`;


            // ------------------------------------------------
            // Determine whether current user reacted
            // ------------------------------------------------

            const users =
                reactionUsers &&
                reactionUsers[reaction]
                    ? reactionUsers[reaction]
                    : [];


            if (
                users.includes(
                    username
                )
            ) {

                button.classList.add(
                    "mine"
                );

            }


            // ------------------------------------------------
            // Tooltip
            // ------------------------------------------------

            if (
                users.length > 0
            ) {

                button.title =
                    users.join(
                        ", "
                    );

            }


            // ------------------------------------------------
            // Clicking an existing reaction toggles it
            // ------------------------------------------------

            button.addEventListener(
                "click",
                () => {

                    sendReaction(
                        messageId,
                        reaction
                    );

                }
            );


            container.appendChild(
                button
            );

        }
    );

}


// ============================================================
// SEND REACTION
// ============================================================

function sendReaction(
    messageId,
    reaction
) {

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
                "reaction",

            messageId:
                messageId,

            reaction:
                reaction,

        })
    );

}


// ============================================================
// UPDATE REACTIONS
// ============================================================

function updateMessageReactions(
    data
) {

    const messageDiv =
        document.querySelector(
            `[data-message-id="${data.messageId}"]`
        );


    if (
        !messageDiv
    ) {

        return;

    }


    const reactionContainer =
        messageDiv.querySelector(
            ".message-reactions"
        );


    if (
        !reactionContainer
    ) {

        return;

    }


    renderReactions(
        reactionContainer,
        data.messageId,
        data.reactions || {},
        data.reactionUsers || {}
    );

}


// ============================================================
// START REPLY
// ============================================================

function startReply(
    message
) {

    replyingToMessage =
        message;


    const replyBar =
        document.getElementById(
            "replyBar"
        );


    const replyName =
        document.getElementById(
            "replyBarName"
        );


    const replyText =
        document.getElementById(
            "replyBarText"
        );


    if (
        !replyBar ||
        !replyName ||
        !replyText
    ) {

        console.error(
            "Reply bar elements are missing from HTML."
        );


        return;

    }


    replyName.textContent =
        `Replying to ${message.username}`;


    replyText.textContent =
        message.message;


    replyBar.classList.add(
        "active"
    );


    input.focus();


    // --------------------------------------------------------
    // Scroll input area into view on mobile
    // --------------------------------------------------------

    replyBar.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
    });

}


// ============================================================
// CANCEL REPLY
// ============================================================

function cancelReply() {

    replyingToMessage =
        null;


    const replyBar =
        document.getElementById(
            "replyBar"
        );


    if (
        replyBar
    ) {

        replyBar.classList.remove(
            "active"
        );

    }


    const replyName =
        document.getElementById(
            "replyBarName"
        );


    const replyText =
        document.getElementById(
            "replyBarText"
        );


    if (
        replyName
    ) {

        replyName.textContent =
            "";

    }


    if (
        replyText
    ) {

        replyText.textContent =
            "";

    }


    input.focus();

}


// ============================================================
// SCROLL TO MESSAGE
// ============================================================

function scrollToMessage(
    messageId
) {

    const target =
        document.querySelector(
            `[data-message-id="${messageId}"]`
        );


    if (
        !target
    ) {

        console.log(
            "Message not found:",
            messageId
        );


        return;

    }


    target.scrollIntoView({
        behavior: "smooth",
        block: "center",
    });


    target.classList.remove(
        "reply-highlight"
    );


    // Force animation restart

    void target.offsetWidth;


    target.classList.add(
        "reply-highlight"
    );


    setTimeout(
        () => {

            target.classList.remove(
                "reply-highlight"
            );

        },
        1600
    );

}


// ============================================================
// SEND MESSAGE
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


    // --------------------------------------------------------
    // Stop typing
    // --------------------------------------------------------

    clearTimeout(
        typingTimeout
    );


    socket.send(
        JSON.stringify({

            type:
                "typing",

            typing:
                false,

        })
    );


    // --------------------------------------------------------
    // Build message
    // --------------------------------------------------------

    const payload = {

        type:
            "message",

        message:
            message,

    };


    // --------------------------------------------------------
    // Add reply if replying
    // --------------------------------------------------------

    if (
        replyingToMessage
    ) {

        payload.replyTo =
            replyingToMessage.id;

    }


    console.log(
        "Sending:",
        payload
    );


    // --------------------------------------------------------
    // Send
    // --------------------------------------------------------

    socket.send(
        JSON.stringify(
            payload
        )
    );


    // --------------------------------------------------------
    // Clear
    // --------------------------------------------------------

    input.value =
        "";

    input.style.height =
        "40px";


    // --------------------------------------------------------
    // Clear reply
    // --------------------------------------------------------

    cancelReply();


    input.focus();

}


// ============================================================
// LOGIN
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
                roomKey,

        })
    );

}


// ============================================================
// LOGIN BUTTON
// ============================================================

usernameButton.addEventListener(
    "click",
    joinChat
);


// ============================================================
// SEND BUTTON
// ============================================================

button.addEventListener(
    "click",
    sendMessage
);


// ============================================================
// USERNAME ENTER
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
// ROOM KEY ENTER
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
// MESSAGE ENTER
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
// TYPING + TEXTAREA RESIZE
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
                    true,

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
                                    false,

                            })
                        );

                    }

                },
                1000
            );

    }
);


// ============================================================
// CLICK OUTSIDE REACTION PICKERS
// ============================================================

document.addEventListener(
    "click",
    (event) => {

        if (
            event.target.closest(
                ".react-button"
            ) ||
            event.target.closest(
                ".reaction-picker"
            )
        ) {

            return;

        }


        document
            .querySelectorAll(
                ".reaction-picker.active"
            )
            .forEach(
                (picker) => {

                    picker.classList.remove(
                        "active"
                    );

                }
            );

    }
);


// ============================================================
// DISCONNECT
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
// WEBSOCKET ERROR
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


// ============================================================
// REPLY BAR SETUP
// ============================================================

const cancelReplyButton =
    document.getElementById(
        "cancelReplyButton"
    );


if (
    cancelReplyButton
) {

    cancelReplyButton.addEventListener(
        "click",
        cancelReply
    );

}


// ============================================================
// DARK MODE
// ============================================================

const savedTheme =
    localStorage.getItem(
        "theme"
    );


if (
    savedTheme === "dark"
) {

    document.body.classList.add(
        "dark-mode"
    );


    if (
        themeToggle
    ) {

        themeToggle.textContent =
            "☀️";

    }

} else {

    if (
        themeToggle
    ) {

        themeToggle.textContent =
            "🌙";

    }

}


if (
    themeToggle
) {

    themeToggle.addEventListener(
        "click",
        () => {

            const isDark =
                document.body.classList.toggle(
                    "dark-mode"
                );


            localStorage.setItem(
                "theme",
                isDark
                    ? "dark"
                    : "light"
            );


            themeToggle.textContent =
                isDark
                    ? "☀️"
                    : "🌙";

        }
    );

}


// ============================================================
// PWA SERVICE WORKER
// ============================================================

if (
    "serviceWorker" in navigator
) {

    window.addEventListener(
        "load",
        () => {

            navigator.serviceWorker
                .register(
                    "/service-worker.js"
                )
                .then(
                    () => {

                        console.log(
                            "Service worker registered."
                        );

                    }
                )
                .catch(
                    (error) => {

                        console.error(
                            "Service worker registration failed:",
                            error
                        );

                    }
                );

        }
    );

}
