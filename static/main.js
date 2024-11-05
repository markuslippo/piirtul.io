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
const roomIDBanner = document.getElementById('room-id');
const roomStatus = document.getElementById('room-status');
const quitButton = document.querySelector('.quit-button')

// Our current user's name and the room owner's name
let username;
//let roomOwner;
let roomID;
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
        roomID = user.roomID || null;
        //roomOwner = user.roomOwner || null;
        initializeWebSocket();
    }
});

function generateRoomID(length) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * characters.length);
      result += characters[randomIndex];
    }
    return result;
  }
  
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
        initiateUser();
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
            case "roomInitiation":
                onRoomInitiation(data.success, data.room_id, data.participants);
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
            default:
                console.log("Unknown message type:", data.type);
                break;
        }
    };
}

// Send the first message to the WebSocket. If room creator, send the initiation. 
// If we are a participant, we send the roomAvailability message.
function initiateUser() {
    addUser(username, role);
    send({type: 'initiation', name: username });
}

// Handles the initiation response from the server.
function onInitiation(success) {
    if (success === true) {
        console.log("Initiation successful");

        switch(role) {
            case 'creator':
                roomID = generateRoomID(4);
                send({ type: 'roomInitiation', room_id: roomID, name: username, role: 'creator' });
                break;
            case 'participant':
                send({ type: 'roomInitiation', room_id: roomID, name: username, role: 'participant' });
                break;
            default:
                console.log("Unknown message type:", data.type);
                break;
        }
    } else {
        console.log("Server: Initiation failed");
    }
}

// Handles the room initiation response from the server.
function onRoomInitiation(success, newRoomID, participants) {
    if (success) {
        console.log("Room initiation successful");
        roomID = newRoomID
        roomIDBanner.innerHTML += roomID;
        setupPeerConnection();
        if (role === "participant") {
            // This is currently for 1 to 1
            peerUsername = participants[0]
            addUser(peerUsername, 'creator');

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

            // this doesnt work yet maybe a start for n to n
            /* participants.forEach(peer => {
                peerUsername = peer;
                addUser(peer, 'boss');
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
            }); */
        }
    } else {
        alert("Room not available. Please try again!");
        socket.close();
        window.location.href = '/';
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