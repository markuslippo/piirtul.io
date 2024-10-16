const users = []
const chatMessages = []

// Retrieve the username, role, and roomCode from localStorage
document.addEventListener("DOMContentLoaded", function() {

    if (window.name) {
        // Handle room creation or joining based on role
        if (window.role === 'creator') {
            send({
                type: "createRoom",
                name: window.name
            });
        } else if (role === 'participant') {
            send({
                type: "joinRoom",
                name: name,
                roomCode: roomCode
            });
        }

        // Display the user in the user list
        updateUserList(name);

    } else {
        alert("No username found! Redirecting to the homepage.");
        window.location.href = '/';
    }
});

// Populate user list
const userList = document.getElementById('user-list');
users.forEach(user => {
    const userItem = document.createElement('li');
    userItem.textContent = user;
    userList.appendChild(userItem);

    userItem.addEventListener('click', () => {
        speakUserName(user); 
    });
});

// Populate chat messages
const chatMessagesContainer = document.getElementById('chat-messages');
chatMessages.forEach(chat => {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message';
    messageDiv.textContent = `${chat.user}: ${chat.message}`;
    chatMessagesContainer.appendChild(messageDiv);

    messageDiv.addEventListener('click', () => {
        speakMessage(messageDiv.textContent); 
    });
});

// Send message
const sendMessageButton = document.getElementById('send-message');
const chatInput = document.getElementById('chat-input');

sendMessageButton.addEventListener('click', sendMessage);

chatInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && document.activeElement === chatInput) { 
        sendMessage();
    }
});


function sendMessage() {
    const message = chatInput.value;
    if (message) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'chat-message';
        messageDiv.textContent = `You: ${message}`;
        chatMessagesContainer.appendChild(messageDiv);
        chatInput.value = '';

        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
        chatInput.focus();

    }
}

// Other

const quitButton = document.querySelector('.quit-button')
quitButton.addEventListener('click', () => {
    window.location.href = '/'
})