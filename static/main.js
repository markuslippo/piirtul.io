// WebSocket connection with server
let socket;

// WebRTC setup
window.RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
window.RTCIceCandidate = window.RTCIceCandidate || window.mozRTCIceCandidate || window.webkitRTCIceCandidate;
window.RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription || window.webkitRTCSessionDescription;

// WebRTC connected user, the connection to peer and the data channel.
let peerUsername, peerConnection, dataChannel;

// ICE server
const configuration = {
    "iceServers": [{ "urls": "stun:stun.1.google.com:19302" }]
};

// DOM stuff for readability
const sendMessageButton = document.querySelector('#send-message');
const messageInput = document.querySelector('#chat-input');
const chatArea = document.querySelector('#chat-messages');
const usersList = document.getElementById('user-list');
const roomStatus = document.getElementById('room-status');
const quitButton = document.querySelector('.quit-button')

// Our current user's name and the room owner's name
let username;
let roomOwner;
let role;

// The array containing the participants of this room.
let users = [];

// Upon loading the page we need to check that the userItem passed from
// the main page exists. If not, redirect back to main page.
// If the userItem exists initialize the WebSocket and send the initiation message.
window.addEventListener('DOMContentLoaded', () => {
    const userItem = localStorage.getItem('user');
    if (!userItem) {
        alert('Please input your name in the main page.')
        window.location.href = '/';
    } else {
        const user = JSON.parse(userItem);
        localStorage.removeItem('user');
        role = user.role;
        username = user.name;
        roomOwner = user.roomOwner || null;
        initializeWebSocket();
    }
});

// Sends a message to the WebSocket, if it is open
function send(message) {
    if(socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
    }
}


// Initialize the WebSocket connection. After opening, send the initiation message.
function initializeWebSocket() {
    socket = new WebSocket('ws://localhost:9090/websocket');
    socket.onopen = () => {
        console.log("Connected to signaling server WebSocket.");
        initiation();
    };

    socket.onerror = (err) => {
        console.log("WebSocket error:", err);
    };

    // Then we wait and listen for messages.
    socket.onmessage = function(message) {
        console.log("Received message:", message.data);
        var data = JSON.parse(message.data);
        switch(data.type) {
            case "initiation":
                onInitiation(data.success);
                break;
            case "offer":
                onOffer(data.offer, data.name);
                break;
            case "answer":
                onAnswer(data.answer);
                break;
            case "candidate":
                onCandidate(data.candidate);
                break;
            case "peerLeavingRoom":
                onPeerLeave();
                break;
            case "roomAvailability":
                onRoomAvailability(data.success);
                break;
            default:
                console.log("Unknown message type:", data.type);
                break;
        }
    };
}

// Send the first message to the WebSocket. If room creator, send the initiation. 
// If we are a participant, we send the roomAvailability message.
function initiation() {
    // Add ourself
    addUser(username, role);
    if (role === 'creator') {
        send({ type: 'initiation', name: username, role: 'creator' });
    } else if (role === 'participant') {
        if (roomOwner) {
            send({ type: 'roomAvailability', name: roomOwner });
        }
    }
}

// Handles the initiation response from the server.
function onInitiation(success) {
    if (success === true) {
        console.log("Initiation successful");
        setupPeerConnection();
        // Here if we have the peerUsername, we are the participant, and should open a datachannel and send the offer.
        if (peerUsername) {
            var dataChannelOptions = { reliable: true };
            dataChannel = peerConnection.createDataChannel(peerUsername + "-dataChannel", dataChannelOptions);
            openDataChannel();

            peerConnection.createOffer()
            .then(function (offer) {
                return peerConnection.setLocalDescription(offer);
            })
            .then(function () {
                send({ type: "offer", name: peerUsername, offer: peerConnection.localDescription });
            })
            .catch(function (error) {
                console.log("Error creating or setting offer:", error);
            });
        }
    } else {
        console.log("Server: Initiation failed");
    }
}

// Create a new RTCPeerConnection with the configuration
// Initiate connection to handle upcoming ICE candidate event.
// After both parties have their answer/offers, they start to exchange the candidates automatically.
// Initiate connection to handle upcoming data channel event
function setupPeerConnection() {
    peerConnection = new RTCPeerConnection(configuration);
    peerConnection.onicecandidate = function (event) {
        if (event.candidate) {
            send({
                type: "candidate",
                name: peerUsername,
                candidate: event.candidate
            });
        }
    };
    peerConnection.ondatachannel = function (event) {
        dataChannel = event.channel;
        openDataChannel();
    };
}

// Handles the offer message forwarded via the server.
// This code is executed only as a Room owner.
function onOffer(offer, name) {
    peerUsername = name;
    displayRoomStatus(peerUsername + " has joined the room");
    addUser(peerUsername, 'participant');

    peerConnection.setRemoteDescription(new RTCSessionDescription(offer))
    .then(function() {
        return peerConnection.createAnswer();
    })
    .then(function(answer) {
        return peerConnection.setLocalDescription(answer);
    })
    .then(function() {
        send({ type: "answer", name: peerUsername, answer: peerConnection.localDescription });
    })
    .catch(function(error) {
        console.log("Error handling offer or setting descriptions:", error);
    });
}

// Handles the answer message forwarded via the server.
// Only for the participant.
function onAnswer(answer) {
    peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    displayRoomStatus(username + " has joined the room");
}

// The function that handles the candidate message forwarded via the server.
function onCandidate(candidate) {
    peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
    .then(function() {
        console.log("ICE candidate successfully added");
    })
    .catch(function(error) {
        console.log("Error adding ICE candidate:", error);
    });
}

// The function that handles leaving the WebRTC connection.
// We also have to initialize the peer connection again.
function onPeerLeave() {
    console.log("Peer closed connection");
    displayRoomStatus(peerUsername + ' has left the room');
    removeUser(peerUsername);
    peerUsername = null;
    
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (dataChannel) {
        dataChannel.close();
        dataChannel = null;
    }
    setupPeerConnection();
}

// Handle the room availability response. If room exists, send initiation. Only participant executes this code.
function onRoomAvailability(success) {
    if (success) {
        console.log("Room available. Proceeding with login.");
        send({ type: "initiation", name: username, role: "participant" });
        peerUsername = roomOwner;
        addUser(peerUsername, 'creator');
    } else {
        alert("Room not found. Please check the room owner's name.");
        socket.close();
        window.location.href = '/';
    }
}

// Handle sending messages via the WebRTC data channel
sendMessageButton.addEventListener("click", function() {
    var message = messageInput.value;
    if (message) {
        sendMessage(message);
        displayMessage(username, message);
        messageInput.value = '';
    }
});

// Open the WebRTC data channel
function openDataChannel() {
    dataChannel.onerror = function (error) {
        console.log("Data Channel Error:", error);
    };

    dataChannel.onmessage = function (event) {
        console.log("Message received:", event.data);
        var receivedData = JSON.parse(event.data);
        displayMessage(receivedData.sender, receivedData.message);
    };

    dataChannel.onopen = function () {
        console.log("Data Channel opened");
    };

    dataChannel.onclose = function () {
        console.log("Data Channel closed");
    };
}

// The function that sends a message to the peer.
function sendMessage(message) {
    if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify({
            sender: username,
            message: message
        }));
    } else {
        console.log("Data channel is not open. Unable to send message.");
    }
}

// Display sent and received messages.
function displayMessage(sender, message) {
    var messageElement = document.createElement('div');
    messageElement.textContent = sender + ": " + message;
    chatArea.appendChild(messageElement);
}

// Display the room status
function displayRoomStatus(status) {
    roomStatus.textContent = status;
}

// Add user to users array and update DOM
function addUser(userName, role) {
    if (!users.some(user => user.name === userName)) {
        users.push({ name: userName, role: role });
        displayUsers(users);
    }
}

// Remove the user from the users array and update DOM
function removeUser(userName) {
    users = users.filter(user => user.name !== userName);
    displayUsers(users);
}

// For displaying the users list. Since the user count is relatively small we clear the list 
// and render the names from scratch every time a new user is added. 
// If a user leaves, we just remove them from the users list without having to further manipulate the DOM.
function displayUsers(users) {
    usersList.innerHTML = '';
    users.forEach((user) => {
        const userItem = document.createElement('li');
        if(user.role === "creator") {
            userItem.textContent = `${user.name} (owner)`;
        } else {
            userItem.textContent = user.name;
        }
        usersList.appendChild(userItem);
    });
}

quitButton.addEventListener('click', () => {
    send({ type: 'leaveRoom', name: username})
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (dataChannel) {
        dataChannel.close();
        dataChannel = null;
    }
    socket.close();
    window.location.href = '/'
})

function speakUserName(name) {
    const utterance = new SpeechSynthesisUtterance(name);
    speechSynthesis.speak(utterance);
}

function speakMessage(message) {
    const utterance = new SpeechSynthesisUtterance(message);
    speechSynthesis.speak(utterance);
}

// Drawing

const canvas = document.getElementById('drawing-canvas');
const ctx = canvas.getContext('2d');

let isDrawing = false;
let penColor = '#fcfafa';
let penThickness = 2;

const thicknessSelect = document.getElementById('pen-thickness');
const colorPicker = document.getElementById('color-picker');

colorPicker.addEventListener('input', (e) => penColor = e.target.value);
thicknessSelect.addEventListener('change', (e) => penThickness = parseInt(e.target.value));

canvas.width = canvas.parentElement.clientWidth * 0.9;
canvas.height = canvas.parentElement.clientHeight * 0.9;

canvas.addEventListener('mousedown', (e) => {
    isDrawing = true;
    ctx.beginPath();
    ctx.moveTo(e.offsetX, e.offsetY);
    ctx.strokeStyle = penColor;
    ctx.lineWidth = penThickness;
    ctx.lineCap = 'round';
});

canvas.addEventListener('mousemove', (e) => {
    if (isDrawing) {
        ctx.lineTo(e.offsetX, e.offsetY);
        ctx.stroke();
    }
});

canvas.addEventListener('mouseup', () => isDrawing = false);
canvas.addEventListener('mouseleave', () => isDrawing = false);

const clearCanvasButton = document.getElementById('clear-canvas');

clearCanvasButton.addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
});
