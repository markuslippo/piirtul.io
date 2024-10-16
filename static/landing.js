// landing.js

window.connection = new WebSocket('ws://localhost:9090/websocket');

var createRoomButton = document.querySelector('#create-room-btn'); 
var joinRoomButton = document.querySelector('#join-room-btn'); 

window.RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
window.RTCIceCandidate = window.RTCIceCandidate || window.mozRTCIceCandidate || window.webkitRTCIceCandidate;
window.RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription || window.webkitRTCSessionDescription;

var connectedUser, peerConnection, dataChannel;
var name = "";
var role = "";

// Function to send messages to the signaling server
function send(message) { 
    message.name = name; // Include the sender's name
    connection.send(JSON.stringify(message)); 
}

// Function to open the data channel and set up event handlers
function openDataChannel() { 
    dataChannel.onerror = function (error) { 
        console.log("Error on data channel:", error); 
        // Handle error accordingly
    };
    
    dataChannel.onmessage = function (event) { 
        console.log("Message received:", event.data); 
        // Handle incoming message
    };  

    dataChannel.onopen = function() {
        console.log("Data channel is open and ready to be used.");
    };

    dataChannel.onclose = function() {
        console.log("Data channel is closed.");
    };
}

// When creating a room
createRoomButton.addEventListener("click", function() {
    name = document.querySelector('#name').value;
    if (name.length > 0) {
        role = 'creator';

        send({
            type: "createRoom",
            name: name
        });
    } else {
        alert("Please enter a name");
    }
});

// When joining a room
joinRoomButton.addEventListener("click", function() {
    name = document.querySelector('#name').value;
    if (!name) {
        alert("Please enter a name");
    } else {
        const roomCode = prompt("Please enter the name of the room owner");
        if (roomCode && roomCode.length > 0) {
            role = 'joiner';
            connectedUser = roomCode;

            setupPeerConnection();

            var dataChannelOptions = {
                reliable: true
            };

            dataChannel = peerConnection.createDataChannel("dataChannel", dataChannelOptions);
            openDataChannel();

            // Create an offer and send it with the joinRoom message
            peerConnection.createOffer().then(function(offer) { 
                peerConnection.setLocalDescription(offer);  

                send({
                    type: "joinRoom",
                    name: name,
                    offer: {
                        type: offer.type,
                        sdp: offer.sdp
                    }
                });

            }).catch(function(error) { 
                console.log("Error creating an offer: ", error); 
            });

        } else {
            alert("Please enter a valid room code");
        }
    }
});

// Function to set up the RTCPeerConnection
function setupPeerConnection() {
    var configuration = { 
        "iceServers": [{ "urls": "stun:stun.l.google.com:19302" }] 
    }; 

    peerConnection = new RTCPeerConnection(configuration);

    // Handler when receiving ICE candidates from STUN server
    peerConnection.onicecandidate = function (event) { 
        if (event.candidate) { 
            send({ 
                type: "candidate", 
                candidate: {
                    candidate: event.candidate.candidate,
                    sdpMid: event.candidate.sdpMid,
                    sdpMLineIndex: event.candidate.sdpMLineIndex
                }
            });
        } else {
            // ICE gathering completed
            send({ 
                type: "candidate", 
                candidate: null
            });
        }
    };

    // When a data channel is received
    peerConnection.ondatachannel = function(event) {
        dataChannel = event.channel;
        openDataChannel();
    };

    // Handle ICE connection state change events
    peerConnection.oniceconnectionstatechange = function() {
        var iceState = peerConnection.iceConnectionState;
        console.log("ICE connection state changed to: ", iceState);
        if (iceState === "connected") {
            console.log("Peer connection established.");
        } else if (iceState === "disconnected" || iceState === "closed") {
            onLeave();
        }
    };
}

// Function to handle incoming messages from the signaling server
connection.onmessage = function (message) { 
    var data = JSON.parse(message.data); 

    switch(data.type) {  // Changed 'Type' to 'type'
        case "createRoom": 
            onCreateRoom(data); 
            break; 
        case "offer": 
            onOffer(data); 
            break; 
        case "answer":
            onAnswer(data); 
            break; 
        case "candidate": 
            onCandidate(data); 
            break; 
        case "leaving":
            onLeave();
            break;
        default: 
            console.log("Unknown message type:", data.type);
            break; 
    } 
};

// Handle createRoom response
function onCreateRoom(data) { 
    if (data.success === true) {  // Changed 'Success' to 'success'
        console.log("Room created successfully with code: " + data.roomCode);  // Changed 'RoomCode' to 'roomCode'
        setupPeerConnection();
        // As a creator, wait for offers from participants
    } else {
        alert("Failed to create room");
    }
}

// When receiving an offer from a participant (only the creator will receive this)
function onOffer(data) { 
    if (role === 'creator') {
        connectedUser = data.name; // the participant's name

        var offerDesc = new RTCSessionDescription({
            type: data.offer.type,
            sdp: data.offer.sdp
        });

        peerConnection.setRemoteDescription(offerDesc).then(function() {
            // Create an answer
            peerConnection.createAnswer().then(function(answer) {
                peerConnection.setLocalDescription(answer);

                send({ 
                    type: "answer", 
                    answer: {
                        type: answer.type,
                        sdp: answer.sdp
                    }
                }); 
            }).catch(function(error) {
                console.log("Error when creating an answer: ", error);
            });
        }).catch(function(error) {
            console.log("Error setting remote description: ", error);
        });
    }
}

// When receiving an answer from the creator (only the participant will receive this)
function onAnswer(data) { 
    if (role === 'joiner') {
        var answerDesc = new RTCSessionDescription({
            type: data.answer.type,
            sdp: data.answer.sdp
        });
        peerConnection.setRemoteDescription(answerDesc).catch(function(error) {
            console.log("Error setting remote description: ", error);
        });
    }
}

// When receiving an ICE candidate from the remote peer
function onCandidate(data) { 
    if (data.candidate) {
        var candidate = new RTCIceCandidate({
            sdpMLineIndex: data.candidate.sdpMLineIndex,
            sdpMid: data.candidate.sdpMid,
            candidate: data.candidate.candidate
        });
        peerConnection.addIceCandidate(candidate).catch(function(error) {
            console.log("Error adding received ICE candidate", error);
        });
        console.log("Added the remote ICE candidate.");
    } else {
        console.log("End of candidates.");
    }
}

// Handle the event when the other peer leaves the connection
function onLeave() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    connectedUser = null;
    console.log("Connection closed.");
}

// Connection opened
connection.onopen = function () { 
    console.log("Connected to the signaling server."); 
};

// Handle any errors that occur on the signaling server connection
connection.onerror = function (err) { 
    console.log("Got error on trying to connect to the signaling server:", err); 
};
