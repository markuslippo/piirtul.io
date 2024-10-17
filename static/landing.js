var createRoomButton = document.querySelector('#create-room-btn');
var joinRoomButton = document.querySelector('#join-room-btn');
var sendMessageButton = document.querySelector('#sendMessageButton');
var messageInput = document.querySelector('#messageInput');
var chatArea = document.querySelector('#chatArea');
var userbox = document.querySelector('#userbox');

window.RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
window.RTCIceCandidate = window.RTCIceCandidate || window.mozRTCIceCandidate || window.webkitRTCIceCandidate;
window.RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription || window.webkitRTCSessionDescription;

var connectedUser, peerConnection, dataChannel;
var name = "";
var roomOwner = "";

var connection = new WebSocket('ws://localhost:9090/websocket');

connection.onmessage = function (message) {
    console.log("Received message:", message.data);
    var data = JSON.parse(message.data);
    
    switch(data.type) {
        case "initiation":
            onLogin(data.success);
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
        case "users":
            onUsers(data.users);
            break;
        case "roomAvailability":
            onRoomAvailability(data.success);
            break;
        default:
            console.log("Unknown message type:", data.type);
            break;
    }
};

connection.onopen = function () {
    console.log("Connected to the signaling server.");
};

connection.onerror = function (err) {
    console.log("Error connecting to the signaling server:", err);
};

createRoomButton.addEventListener("click", function() {
    name = document.querySelector('#name').value;
    if (name.length > 0) {
        console.log("Creating room as:", name);
        document.getElementById('roomStatus').textContent = "Waiting for users to join room";
        send({
            type: "initiation",
            name: name,
            role: "creator"
        });
    } else {
        console.log("Please enter a name");
    }
});

joinRoomButton.addEventListener("click", function() {
    name = document.querySelector('#name').value;
    if (name.length > 0) {
        roomOwner = prompt("Enter the room owner's name:");
        if (roomOwner) {
            console.log("Checking room availability for room owner:", roomOwner);
            checkRoomAvailability(roomOwner);
        }
    } else {
        console.log("Please enter a name");
    }
});

sendMessageButton.addEventListener("click", function() {
    var message = messageInput.value;
    if (message) {
        sendMessage(message);
        displayMessage(name, message);
        messageInput.value = '';
    }
});


function checkRoomAvailability(roomOwner) {
    // Send a message to check room availability before logging in
    send({
        type: "roomAvailability",
        name: roomOwner
    });
}

function onLogin(success) {
    if (success === false) {
        console.log("Login failed");
    } else {
        console.log("Login successful");
        var configuration = {
            "iceServers": [{ "urls": "stun:stun.1.google.com:19302" }]
        };

        peerConnection = new RTCPeerConnection(configuration);

        peerConnection.onicecandidate = function (event) {
            if (event.candidate) {
                send({
                    type: "candidate",
                    candidate: event.candidate
                });
            }
        };

        peerConnection.ondatachannel = function (event) {
            dataChannel = event.channel;
            openDataChannel();
        };

        if (connectedUser) {
            var dataChannelOptions = {
                reliable: true
            };
            dataChannel = peerConnection.createDataChannel(connectedUser + "-dataChannel", dataChannelOptions);
            openDataChannel();

            peerConnection.createOffer(function (offer) {
                send({
                    type: "offer",
                    offer: offer
                });
                peerConnection.setLocalDescription(offer);
            }, function (error) {
                console.log("Error creating offer:", error);
            });
        }
    }
}

function onOffer(offer, name) {
    connectedUser = name;
    document.getElementById('roomStatus').textContent = name + " has joined the room";
    document.getElementById('connectedUserDisplay').textContent = connectedUser;
    peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

    peerConnection.createAnswer(function (answer) {
        peerConnection.setLocalDescription(answer);
        send({
            type: "answer",
            answer: answer
        });
    }, function (error) {
        console.log("Error creating answer:", error);
    });
}

function onAnswer(answer) {
    peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    document.getElementById('connectedUserDisplay').textContent = connectedUser;
}

function onCandidate(candidate) {
    peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    console.log("ICE candidate added");
}

function onLeave() {
    connectedUser = null;
    peerConnection.close();
    peerConnection = null;
    console.log("Peer connection closed");
    document.getElementById('connectedUserDisplay').textContent = 'None';
    document.getElementById('roomStatus').textContent = 'Waiting for users to join room';
    
}

function onUsers(users) {
    console.log("All users:", users);
}


// Handle the room availability response
function onRoomAvailability(success) {
    if (success) {
        // Room (user) found, proceed with login
        console.log("Room available. Proceeding with login.");
        send({
            type: "initiation",
            name: name,
            role: "participant"
        });
        connectedUser = roomOwner;
    } else {
        // Room (user) not found, alert the user
        alert("Room not found. Please check the room owner's name.");
    }
}

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

function send(message) {
    if (connectedUser) {
        message.name = connectedUser;
    }
    connection.send(JSON.stringify(message));
}

function sendMessage(message) {
    if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify({
            sender: name,
            message: message
        }));
    } else {
        console.log("Data channel is not open. Unable to send message.");
    }
}

function displayMessage(sender, message) {
    var messageElement = document.createElement('div');
    messageElement.textContent = sender + ": " + message;
    messageElement.style.color = "white";
    chatArea.appendChild(messageElement);
}