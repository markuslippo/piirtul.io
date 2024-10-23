// WebSocket connection with server
var wsConnection = new WebSocket('ws://localhost:9090/websocket');

// WebRTC setup
window.RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
window.RTCIceCandidate = window.RTCIceCandidate || window.mozRTCIceCandidate || window.webkitRTCIceCandidate;
window.RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription || window.webkitRTCSessionDescription;

// WebRTC connected user, the connection to peer and the data channel.
var peerUsername, peerConnection, dataChannel;

// ICE server
var configuration = {
    "iceServers": [{ "urls": "stun:stun.1.google.com:19302" }]
};

// DOM stuff for readability
var createRoomButton = document.querySelector('#create-room-btn');
var joinRoomButton = document.querySelector('#join-room-btn');
var sendMessageButton = document.querySelector('#sendMessageButton');
var messageInput = document.querySelector('#messageInput');
var chatArea = document.querySelector('#chatArea');
var nameInput = document.querySelector('#name');
var roomStatus = document.getElementById('roomStatus');
var usersList = document.getElementById('connectedUserDisplay');

// Our current user's name and the room owner's name
var username = "";
var roomOwner = "";

// Log successful WebSocket connection
wsConnection.onopen = function () {
    console.log("Connected to signaling server WebSocket.");
};

// Log WebSocket error
wsConnection.onerror = function (err) {
    console.log("Error connecting to the signaling server WebSocket:", err);
};

// Listens for messages from the WebSocket.
wsConnection.onmessage = function (message) {
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
        case "leave":
            onLeave();
            break;
        case "roomAvailability":
            onRoomAvailability(data.success);
            break;
        default:
            console.log("Unknown message type:", data.type);
            break;
    }
};

// Sends a message to the WebSocket
function send(message) {
    wsConnection.send(JSON.stringify(message));
}

// Handles the initiation response from the server.
function onInitiation(success) {
    if (success === true) {
        console.log("Initiation successful");
        
        // Create a new RTCPeerConnection with the configuration
        peerConnection = new RTCPeerConnection(configuration);
        // Initiate connection to handle ICE candidate event
        peerConnection.onicecandidate = function (event) {
            if (event.candidate) {
                send({
                    type: "candidate",
                    name: peerUsername,
                    candidate: event.candidate
                });
            }
        };
        // Initiate connection to handle data channel event
        peerConnection.ondatachannel = function (event) {
            dataChannel = event.channel;
            openDataChannel();
        };
        
        if (peerUsername) {
            var dataChannelOptions = { reliable: true };
            dataChannel = peerConnection.createDataChannel(peerUsername + "-dataChannel", dataChannelOptions);
            openDataChannel();

            peerConnection.createOffer()
            .then(function (offer) {
                return peerConnection.setLocalDescription(offer);
            })
            .then(function () {
                send({
                    type: "offer",
                    name: peerUsername,
                    offer: peerConnection.localDescription
                });
            })
            .catch(function (error) {
                console.log("Error creating or setting offer:", error);
            });
        }
    } else {
        console.log("Initiation failed");
    }
}

// Handles the offer message forwarded via the server.
// This code is reached only as a Room owner.
function onOffer(offer, name) {
    peerUsername = name;
    roomStatus.textContent = peerUsername + " has joined the room";
    usersList.textContent = peerUsername;

    peerConnection.setRemoteDescription(new RTCSessionDescription(offer))
    .then(function() {
        return peerConnection.createAnswer();
    })
    .then(function(answer) {
        return peerConnection.setLocalDescription(answer);
    })
    .then(function() {
        send({
            type: "answer",
            name: peerUsername,
            answer: peerConnection.localDescription
        });
    })
    .catch(function(error) {
        console.log("Error handling offer or setting descriptions:", error);
    });
}

// Handles the answer message forwarded via the server.
// Only for the participant.
function onAnswer(answer) {
    peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    usersList.textContent = peerUsername;
}

// The function that handles the candidate message forwarded via the server.
function onCandidate(candidate) {
    peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
    .then(function() {
        console.log("✅ ICE candidate successfully added");
    })
    .catch(function(error) {
        console.log("Error adding ICE candidate:", error);
    });
}

// The function that handles leaving the WebRTC connection.
// TODO: need to check how this should be ACTUALLY done?
function onLeave() {
    peerUsername = null;
    peerConnection.close();
    peerConnection = null;
    console.log("Peer connection closed");
    document.getElementById('connectedUserDisplay').textContent = 'None';
    roomStatus.textContent = 'Waiting for users to join room';
    
}

// Handle the room availability response. If room exists, initiate
function onRoomAvailability(success) {
    if (success) {
        // Room (user) found, proceed with login
        console.log("Room available. Proceeding with login.");
        send({
            type: "initiation",
            name: username,
            role: "participant"
        });
        peerUsername = roomOwner;
    } else {
        // Room (user) not found, alert the user
        alert("Room not found. Please check the room owner's name.");
    }
}

// Send a message to check room availability before initiation
function checkRoomAvailability(roomOwner) {
    send({
        type: "roomAvailability",
        name: roomOwner
    });
}

// Handle room creation
createRoomButton.addEventListener("click", function() {
    username = nameInput.value;
    if (username.length > 0) {
        console.log("Creating room as:", username);
        roomStatus.textContent = "Waiting for users to join room";
        send({
            type: "initiation",
            name: username,
            role: "creator"
        });
    } else {
        console.log("Please enter a name");
    }
});

// Handle joom roin
joinRoomButton.addEventListener("click", function() {
    username = nameInput.value;
    if (username.length > 0) {
        roomOwner = prompt("Enter the room owner's name:");
        if (roomOwner) {
            console.log("Checking room availability for room owner:", roomOwner);
            checkRoomAvailability(roomOwner);
        }
    } else {
        console.log("Please enter a name");
    }
});

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
    messageElement.style.color = "white";
    chatArea.appendChild(messageElement);
}