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

let currentlyTyping = false;


// ============================================================
// REPLY STATE
// ============================================================

let replyingToMessage = null;


// ============================================================
// EDIT STATE
// ============================================================

let editingMessage = null;


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
                type: "login",

                username:
                    savedUsername,

                roomKey:
                    savedRoomKey
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
            JSON.parse(event.data);


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
        // EDITED MESSAGE
        // ====================================================

        if (
            data.type ===
            "message_edited"
        ) {

            updateEditedMessage(
                data
            );

            return;
        }


        // ====================================================
        // REACTION
        // ====================================================

        if (
            data.type ===
            "reaction"
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
            data.type ===
            "typing"
        ) {

            if (
                data.username ===
                username
            ) {

                return;
            }


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


            /*
             * If editing failed, don't leave
             * the user stuck in edit mode.
             */
            if (
                editingMessage
            ) {

                alert(
                    data.error ||
                    "Unable to edit message."
                );
            }


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

function handleLoginResponse(data) {

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

function handleHistory(data) {

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

    if (
        !message ||
        message.id === undefined ||
        message.id === null
    ) {

        console.warn(
            "Invalid message received:",
            message
        );

        return;
    }


    const existingMessage =
        document.querySelector(
            `[data-message-id="${CSS.escape(String(message.id))}"]`
        );


    if (
        existingMessage
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
        String(message.id);


    messageDiv.style.setProperty(
        "--reply-progress",
        "0"
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
        message.username ||
        "Unknown";


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


    messageElement.classList.add(
        "message-text"
    );


    messageElement.textContent =
        message.message ||
        "";


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
                            "2-digit"
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


    // ========================================================
    // MESSAGE METADATA
    // ========================================================

    const metadata =
        document.createElement("div");


    metadata.classList.add(
        "message-metadata"
    );


    metadata.appendChild(
        timeElement
    );


    if (
        message.edited_at
    ) {

        const editedElement =
            document.createElement("span");


        editedElement.classList.add(
            "edited-label"
        );


        editedElement.textContent =
            "edited";


        metadata.appendChild(
            editedElement
        );
    }


    messageDiv.appendChild(
        metadata
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
    // ADD MESSAGE
    // ========================================================

    messages.appendChild(
        messageDiv
    );


    // ========================================================
    // CLICK
    // ========================================================

    setupMessageClick(
        messageDiv,
        actions
    );


    // ========================================================
    // SWIPE TO REPLY
    // ========================================================

    setupSwipeToReply(
        messageDiv,
        message
    );


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
// SETUP MESSAGE CLICK
// ============================================================

function setupMessageClick(
    messageDiv,
    actions
) {

    messageDiv.addEventListener(
        "click",
        (event) => {

            // Don't trigger when tapping buttons
            if (
                event.target.closest(
                    ".message-actions"
                )
            ) {
                return;
            }

            // Hide menus on other messages
            document
                .querySelectorAll(
                    ".message-actions.active"
                )
                .forEach(
                    (item) => {

                        if (
                            item !== actions
                        ) {
                            item.classList.remove(
                                "active"
                            );
                        }
                    }
                );


            // Hide timestamps on other messages
            document
                .querySelectorAll(
                    ".message.timestamp-visible"
                )
                .forEach(
                    (item) => {

                        if (
                            item !== messageDiv
                        ) {
                            item.classList.remove(
                                "timestamp-visible"
                            );
                        }
                    }
                );


            // Show/hide this message's timestamp
            messageDiv.classList.toggle(
                "timestamp-visible"
            );


            // Show the existing action buttons
            actions.classList.toggle(
                "active"
            );
        }
    );
}



// ============================================================
// SWIPE TO REPLY
// ============================================================

function setupSwipeToReply(
    messageDiv,
    message
) {

    let startX =
        0;

    let startY =
        0;

    let currentX =
        0;

    let swiping =
        false;

    let direction =
        0;


    const threshold =
        65;

    const maxSwipe =
        95;


    messageDiv.addEventListener(
        "touchstart",
        (event) => {

            /*
             * Don't start a swipe when the user
             * is interacting with a button.
             */
            if (
                event.target.closest(
                    "button"
                )
            ) {

                return;
            }


            const touch =
                event.touches[0];


            startX =
                touch.clientX;

            startY =
                touch.clientY;

            currentX =
                startX;

            direction =
                messageDiv.classList.contains(
                    "sender"
                )
                    ? -1
                    : 1;


            swiping =
                true;


            messageDiv.classList.add(
                "swiping"
            );
        },
        {
            passive: true
        }
    );


    messageDiv.addEventListener(
        "touchmove",
        (event) => {

            if (
                !swiping
            ) {

                return;
            }


            const touch =
                event.touches[0];


            currentX =
                touch.clientX;


            const rawDeltaX =
                currentX -
                startX;


            const deltaY =
                Math.abs(
                    touch.clientY -
                    startY
                );


            /*
             * Vertical movement means the user
             * is probably scrolling.
             */
            if (
                deltaY >
                Math.abs(
                    rawDeltaX
                )
            ) {

                swiping =
                    false;


                resetSwipe(
                    messageDiv
                );


                return;
            }


            /*
             * Receiver messages swipe right.
             *
             * Sender messages swipe left.
             */
            const deltaX =
                rawDeltaX *
                direction;


            /*
             * Only allow the intended direction.
             */
            if (
                deltaX <= 0
            ) {

                return;
            }


            const distance =
                Math.min(
                    deltaX,
                    maxSwipe
                );


            messageDiv.style.transform =
                `translateX(${distance * direction}px)`;


            messageDiv.style.setProperty(
                "--reply-progress",
                Math.min(
                    distance /
                    threshold,
                    1
                )
            );
        },
        {
            passive: true
        }
    );


    messageDiv.addEventListener(
        "touchend",
        () => {

            if (
                !swiping
            ) {

                return;
            }


            swiping =
                false;


            const rawDeltaX =
                currentX -
                startX;


            const deltaX =
                rawDeltaX *
                direction;


            resetSwipe(
                messageDiv
            );


            if (
                deltaX >=
                threshold
            ) {

                startReply(
                    message
                );
            }
        }
    );


    messageDiv.addEventListener(
        "touchcancel",
        () => {

            swiping =
                false;


            resetSwipe(
                messageDiv
            );
        }
    );
}


// ============================================================
// RESET SWIPE
// ============================================================

function resetSwipe(
    messageDiv
) {

    messageDiv.style.transform =
        "";


    messageDiv.classList.remove(
        "swiping"
    );


    messageDiv.style.setProperty(
        "--reply-progress",
        "0"
    );
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
        String(reply.id);


    const name =
        document.createElement("div");


    name.classList.add(
        "message-reply-name"
    );


    name.textContent =
        `↩ ${reply.username || "Unknown"}`;


    const text =
        document.createElement("div");


    text.classList.add(
        "message-reply-text"
    );


    text.textContent =
        reply.message ||
        "";


    preview.appendChild(
        name
    );


    preview.appendChild(
        text
    );


    preview.addEventListener(
        "click",
        (event) => {

            event.stopPropagation();


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

function createMessageActions(
    message
) {

    const actions =
        document.createElement("div");


    actions.classList.add(
        "message-actions"
    );


    // ========================================================
    // EDIT BUTTON
    // ========================================================

    if (
        message.username ===
        username
    ) {

        const editButton =
            document.createElement("button");


        editButton.type =
            "button";


        editButton.classList.add(
            "edit-button"
        );


        editButton.textContent =
            "Edit";


        editButton.addEventListener(
            "click",
            (event) => {

                event.stopPropagation();


                startEdit(
                    message
                );


                actions.classList.remove(
                    "active"
                );
            }
        );


        actions.appendChild(
            editButton
        );
    }


    // ========================================================
    // REPLY BUTTON
    // ========================================================

    const replyButton =
        document.createElement("button");


    replyButton.type =
        "button";


    replyButton.classList.add(
        "reply-button"
    );


    replyButton.textContent =
        "Reply";


    replyButton.addEventListener(
        "click",
        (event) => {

            event.stopPropagation();


            startReply(
                message
            );


            actions.classList.remove(
                "active"
            );
        }
    );


    actions.appendChild(
        replyButton
    );


    // ========================================================
    // REACT BUTTON
    // ========================================================

    const reactButton =
        document.createElement("button");


    reactButton.type =
        "button";


    reactButton.classList.add(
        "react-button"
    );


    reactButton.textContent =
        "React";


    reactButton.addEventListener(
        "click",
        (event) => {

            event.stopPropagation();


            const messageDiv =
                reactButton.closest(
                    ".message"
                );


            if (
                !messageDiv
            ) {

                return;
            }


            toggleReactionPicker(
                messageDiv
            );
        }
    );


    actions.appendChild(
        reactButton
    );


    // ========================================================
    // REACTION PICKER
    // ========================================================

    const picker =
        createReactionPicker(
            message
        );


    actions.appendChild(
        picker
    );


    return actions;
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
        "🖤",
        "❤️",
        "😆",
        "😮",
        "😢",
        "🥹"
    ];


    reactions.forEach(
        (reaction) => {

            const choice =
                document.createElement(
                    "button"
                );


            choice.type =
                "button";


            choice.classList.add(
                "reaction-choice"
            );


            choice.textContent =
                reaction;


            choice.title =
                `React ${reaction}`;


            choice.setAttribute(
                "aria-label",
                `React ${reaction}`
            );


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

    if (
        !messageDiv
    ) {

        return;
    }


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
        message.reactions ||
            {},
        message.reactionUsers ||
            {}
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
        typeof reactions !==
            "object"
    ) {

        return;
    }


    Object.entries(
        reactions
    ).forEach(
        ([reaction, count]) => {

            if (
                Number(count) <= 0
            ) {

                return;
            }


            const reactionButton =
                document.createElement(
                    "button"
                );


            reactionButton.type =
                "button";


            reactionButton.classList.add(
                "message-reaction"
            );


            reactionButton.textContent =
                `${reaction} ${count}`;


            const users =
                reactionUsers &&
                Array.isArray(
                    reactionUsers[
                        reaction
                    ]
                )
                    ? reactionUsers[
                        reaction
                    ]
                    : [];


            if (
                users.includes(
                    username
                )
            ) {

                reactionButton.classList.add(
                    "mine"
                );
            }


            if (
                users.length >
                0
            ) {

                reactionButton.title =
                    users.join(
                        ", "
                    );
            }


            reactionButton.addEventListener(
                "click",
                (event) => {

                    event.stopPropagation();


                    sendReaction(
                        messageId,
                        reaction
                    );
                }
            );


            container.appendChild(
                reactionButton
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

        console.error(
            "Cannot send reaction: WebSocket not connected"
        );


        return;
    }


    socket.send(
        JSON.stringify({

            type:
                "reaction",

            messageId:
                messageId,

            reaction:
                reaction

        })
    );
}


// ============================================================
// UPDATE REACTIONS
// ============================================================

function updateMessageReactions(
    data
) {

    if (
        data.messageId ===
            undefined ||
        data.messageId ===
            null
    ) {

        return;
    }


    const messageDiv =
        document.querySelector(
            `[data-message-id="${CSS.escape(String(data.messageId))}"]`
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
        data.reactions ||
            {},
        data.reactionUsers ||
            {}
    );
}


// ============================================================
// START REPLY
// ============================================================

function startReply(
    message
) {

    /*
     * Editing and replying are mutually exclusive.
     */

    if (
        editingMessage
    ) {

        cancelEdit();
    }


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


    replyBar.scrollIntoView({
        behavior:
            "smooth",

        block:
            "nearest"
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
// START EDIT
// ============================================================

function startEdit(
    message
) {

    /*
     * Only allow our own messages.
     */

    if (
        message.username !==
        username
    ) {

        return;
    }


    /*
     * Cancel reply mode.
     */

    if (
        replyingToMessage
    ) {

        cancelReply();
    }


    editingMessage =
        message;


    input.value =
        message.message ||
        "";


    input.style.height =
        "auto";


    input.style.height =
        Math.min(
            input.scrollHeight,
            120
        ) + "px";


    /*
     * Change Send → Save.
     */

    button.textContent =
        "Save";


    button.classList.add(
        "editing"
    );


    /*
     * Add editing class to composer.
     */

    const composer =
        input.closest(
            ".message-input-container"
        );


    if (
        composer
    ) {

        composer.classList.add(
            "editing-message"
        );
    }


    input.focus();


    /*
     * Put cursor at end.
     */

    try {

        input.setSelectionRange(
            input.value.length,
            input.value.length
        );

    } catch {
        // Some input types don't support selection.
    }
}


// ============================================================
// CANCEL EDIT
// ============================================================

function cancelEdit() {

    editingMessage =
        null;


    input.value =
        "";


    input.style.height =
        "40px";


    button.textContent =
        "Send";


    button.classList.remove(
        "editing"
    );


    const composer =
        input.closest(
            ".message-input-container"
        );


    if (
        composer
    ) {

        composer.classList.remove(
            "editing-message"
        );
    }


    input.focus();
}


// ============================================================
// SAVE EDIT
// ============================================================

function saveEdit() {

    if (
        !editingMessage
    ) {

        return;
    }


    const message =
        input.value.trim();


    if (
        message ===
        ""
    ) {

        return;
    }


    if (
        !authenticated
    ) {

        return;
    }


    if (
        socket.readyState !==
        WebSocket.OPEN
    ) {

        console.error(
            "Cannot edit message: WebSocket not connected"
        );


        return;
    }


    stopTyping();


    socket.send(
        JSON.stringify({

            type:
                "edit_message",

            messageId:
                editingMessage.id,

            message:
                message

        })
    );
}


// ============================================================
// UPDATE EDITED MESSAGE
// ============================================================

function updateEditedMessage(
    data
) {

    if (
        data.id ===
            undefined ||
        data.id ===
            null
    ) {

        return;
    }


    const messageDiv =
        document.querySelector(
            `[data-message-id="${CSS.escape(String(data.id))}"]`
        );


    if (
        !messageDiv
    ) {

        return;
    }


    // ========================================================
    // MESSAGE TEXT
    // ========================================================

    const messageElement =
        messageDiv.querySelector(
            ".message-text"
        );


    if (
        messageElement
    ) {

        messageElement.textContent =
            data.message ||
            "";
    }


    // ========================================================
    // REPLY PREVIEW
    // ========================================================

    if (
        data.reply
    ) {

        let replyPreview =
            messageDiv.querySelector(
                ".message-reply-preview"
            );


        if (
            !replyPreview
        ) {

            /*
             * Put reply preview before
             * the message text.
             */

            replyPreview =
                createReplyPreview(
                    data.reply
                );


            if (
                messageElement
            ) {

                messageDiv.insertBefore(
                    replyPreview,
                    messageElement
                );

            } else {

                messageDiv.prepend(
                    replyPreview
                );
            }

        }
    }


    // ========================================================
    // EDITED LABEL
    // ========================================================

    let metadata =
        messageDiv.querySelector(
            ".message-metadata"
        );


    if (
        !metadata
    ) {

        metadata =
            document.createElement(
                "div"
            );


        metadata.classList.add(
            "message-metadata"
        );


        if (
            messageElement
        ) {

            messageElement.after(
                metadata
            );

        } else {

            messageDiv.appendChild(
                metadata
            );
        }
    }


    let editedElement =
        metadata.querySelector(
            ".edited-label"
        );


    if (
        !editedElement
    ) {

        editedElement =
            document.createElement(
                "span"
            );


        editedElement.classList.add(
            "edited-label"
        );


        metadata.appendChild(
            editedElement
        );
    }


    editedElement.textContent =
        "edited";


    // ========================================================
    // REACTIONS
    // ========================================================

    if (
        data.reactions
    ) {

        const reactionContainer =
            messageDiv.querySelector(
                ".message-reactions"
            );


        if (
            reactionContainer
        ) {

            renderReactions(
                reactionContainer,
                data.id,
                data.reactions ||
                    {},
                data.reactionUsers ||
                    {}
            );
        }
    }


    // ========================================================
    // FINISH EDITING
    // ========================================================

    if (
        editingMessage &&
        String(
            editingMessage.id
        ) ===
            String(data.id)
    ) {

        cancelEdit();
    }
}


// ============================================================
// SCROLL TO MESSAGE
// ============================================================

function scrollToMessage(
    messageId
) {

    const target =
        document.querySelector(
            `[data-message-id="${CSS.escape(String(messageId))}"]`
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
        behavior:
            "smooth",

        block:
            "center"
    });


    target.classList.remove(
        "reply-highlight"
    );


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

    /*
     * If currently editing, Send becomes Save.
     */

    if (
        editingMessage
    ) {

        saveEdit();

        return;
    }


    const message =
        input.value.trim();


    if (
        message ===
        ""
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


    stopTyping();


    const payload = {

        type:
            "message",

        message:
            message
    };


    // ========================================================
    // ADD REPLY
    // ========================================================

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


    socket.send(
        JSON.stringify(
            payload
        )
    );


    input.value =
        "";


    input.style.height =
        "40px";


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
        enteredUsername ===
        ""
    ) {

        loginError.textContent =
            "Please enter a username.";


        usernameInput.focus();


        return;
    }


    if (
        roomKey ===
        ""
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
// TYPING
// ============================================================

function startTyping() {

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


    if (
        !currentlyTyping
    ) {

        currentlyTyping =
            true;


        socket.send(
            JSON.stringify({

                type:
                    "typing",

                typing:
                    true

            })
        );
    }


    clearTimeout(
        typingTimeout
    );


    typingTimeout =
        setTimeout(
            () => {

                stopTyping();

            },
            1000
        );
}


// ============================================================
// STOP TYPING
// ============================================================

function stopTyping() {

    clearTimeout(
        typingTimeout
    );


    typingTimeout =
        null;


    if (
        !currentlyTyping
    ) {

        return;
    }


    currentlyTyping =
        false;


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

        // ----------------------------------------------------
        // Escape → cancel edit
        // ----------------------------------------------------

        if (
            event.key ===
                "Escape" &&
            editingMessage
        ) {

            event.preventDefault();


            cancelEdit();


            return;
        }


        // ----------------------------------------------------
        // Enter → Send / Save
        // ----------------------------------------------------

        if (
            event.key ===
                "Enter" &&
            !event.shiftKey
        ) {

            event.preventDefault();


            sendMessage();
        }
    }
);


// ============================================================
// MESSAGE INPUT
// ============================================================

input.addEventListener(
    "input",
    () => {

        input.style.height =
            "auto";


        input.style.height =
            Math.min(
                input.scrollHeight,
                120
            ) + "px";


        /*
         * Don't broadcast typing while
         * editing a message.
         */

        if (
            editingMessage
        ) {

            return;
        }


        startTyping();
    }
);


// ============================================================
// CLICK OUTSIDE MENUS
// ============================================================

document.addEventListener(
    "click",
    (event) => {

        if (
            event.target.closest(
                ".message"
            )
        ) {

            return;
        }


        document
            .querySelectorAll(
                ".message-actions.active"
            )
            .forEach(
                (actions) => {

                    actions.classList.remove(
                        "active"
                    );
                }
            );


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
// CANCEL REPLY BUTTON
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
        (event) => {

            event.preventDefault();


            event.stopPropagation();


            cancelReply();
        }
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
    savedTheme ===
    "dark"
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
        (event) => {

            event.preventDefault();


            event.stopPropagation();


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
// DISCONNECT
// ============================================================

socket.onclose = () => {

    console.log(
        "WebSocket disconnected"
    );


    authenticated =
        false;


    currentlyTyping =
        false;


    clearTimeout(
        typingTimeout
    );


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
// PWA SERVICE WORKER
// ============================================================

if (
    "serviceWorker" in
    navigator
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
