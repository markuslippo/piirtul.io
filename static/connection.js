window.connection = new WebSocket('ws://localhost:9090/websocket');
var connectedUser, peerConnection, dataChannel;

var messageQueue = [];

window.RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
window.RTCIceCandidate = window.RTCIceCandidate || window.mozRTCIceCandidate || window.webkitRTCIceCandidate;
window.RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription || window.webkitRTCSessionDescription;

window.connection.onmessage = function (message) {
    var data = JSON.parse(message.data);
    switch (data.type) {
        case "login":
            onLogin(data.success);
            break;
        case "createRoom":
            onCreateRoom(data);
            break;
        case "joinRoom":
            onJoinRoom(data);
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
        case "updateUserList":
            onUpdateUserList(data.users);
            break;
        default:
            console.log("Unknown message type received:", data.type);
            break;
    }
};

window.connection.onopen = function () { 
    console.log("Connected to the signaling server."); 

    while (messageQueue.length > 0) {
        const message = messageQueue.shift();
        connection.send(JSON.stringify(message));
    }
}; 

window.connection.onerror = function (err) { 
    console.log("Got error on trying to connect to the signaling server:", err); 
};

// Alias for sending messages to the signaling server
function send(message) {
    // If WebSocket is open, send the message
    if (connection.readyState === WebSocket.OPEN) {
        connection.send(JSON.stringify(message));
    } else {
        // Otherwise, queue the message to be sent once the connection is open
        messageQueue.push(message);
    }
}

function onCreateRoom(data) {
    console.log(data)
}

function onJoinRoom(data) {
    console.log(data)
}

// When a user logs in successfully
function onLogin(success) { 
    if (success === false) {
        console.log("Login failed, username already taken!");
    } else { 
        // ICE servers configuration
        var configuration = { 
            "iceServers": [{ "urls": "stun:stun.1.google.com:19302" }] 
        }; 
        peerConnection = new RTCPeerConnection(configuration);

        // Handling the DataChannel creation
        peerConnection.ondatachannel = function(ev) {
            dataChannel = ev.channel;
            openDataChannel();
        };

        // Sending ICE candidates to the other peer
        peerConnection.onicecandidate = function (event) { 
            if (event.candidate) { 
                send({ 
                    type: "candidate", 
                    candidate: event.candidate 
                });
            } 
        };

        // Monitoring the ICE connection state
        peerConnection.oniceconnectionstatechange = function(e) {
            var iceState = peerConnection.iceConnectionState;
            console.log("ICE connection state:", iceState);
            if (iceState === "connected") {
                console.log("Connected to user:", connectedUser);
            } else if (iceState === "disconnected" || iceState === "closed") {
                onLeave();
            }
        };
    }
}

// Handle receiving an offer from a remote peer
function onOffer(offer, name) { 
    connectedUser = name; 
    peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

    // Create an answer for the offer
    peerConnection.createAnswer(function (answer) { 
        peerConnection.setLocalDescription(answer);  
        send({ 
            type: "answer", 
            answer: answer 
        }); 
    }, function (error) { 
        console.log("Error on receiving offer:", error); 
    }); 
}

// Handle receiving an answer from the remote peer
function onAnswer(answer) { 
    peerConnection.setRemoteDescription(new RTCSessionDescription(answer)); 
}

// Handle receiving ICE candidates
function onCandidate(candidate) { 
    peerConnection.addIceCandidate(new RTCIceCandidate(candidate)); 
    console.log("ICE candidate added.");
}

// Handling when the other peer leaves the connection
function onLeave() {
    try {
        peerConnection.close();
        console.log("Connection closed by", connectedUser);
    } catch(err) {
        console.log("Connection already closed");
    }
}

// DataChannel event handling
function openDataChannel() { 
    dataChannel.onerror = function (error) { 
        console.log("Error on data channel:", error); 
    };
    
    dataChannel.onmessage = function (event) { 
        console.log("Message received:", event.data); 
    };  

    dataChannel.onopen = function() {
        console.log("Data channel is open");
    };

    dataChannel.onclose = function() {
        console.log("Data channel is closed");
    };
}

// Notify the user list update
function onUsers(users) {
    console.log("Active users:", users);
}


function onUpdateUserList(users) {
    var userListContent = document.getElementById('user-list-content');
    userListContent.innerHTML = ''; // Clear existing list
    users.forEach(function(user) {
        var li = document.createElement('li');
        li.textContent = user;
        userListContent.appendChild(li);
    });
}

window.send = send;