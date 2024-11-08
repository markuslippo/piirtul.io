// WebSocket connection with server
let socket;

// WebRTC setup
window.RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
window.RTCIceCandidate = window.RTCIceCandidate || window.mozRTCIceCandidate || window.webkitRTCIceCandidate;
window.RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription || window.webkitRTCSessionDescription;

// WebRTC connected user, the connection to peer and the data channel.

let peerConnections = new Map();
// { name -> connection }
let dataChannels = new Map();

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
                onInitiationResponse(data.success);
                break;
            case "roomInitiation":
                onRoomInitiationResponse(data.success, data.room_id, data.participants);
                break;
            case "offer":
                onOfferResponse(data.offer, data.name);
                break;
            case "answer":
                onAnswerResponse(data.answer, data.name);
                break;
            case "candidate":
                onCandidateResponse(data.candidate, data.name);
                break;
            case "peerLeavingRoom":
                onPeerLeaveResponse(data.name);
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
function onInitiationResponse(success) {
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
function onRoomInitiationResponse(success, newRoomID, participants) {
    if (success) {
        console.log("Room initiation successful");
        roomID = newRoomID
        roomIDBanner.innerHTML += roomID;

        if (role === "participant") {
            participants.forEach(name => {
                setupPeerConnection(name);
                addUser(name, 'participant');
                var dataChannelOptions = { reliable: true };
                dataChannels.set(name, peerConnections.get(name).createDataChannel(name + "-dataChannel", dataChannelOptions))
                openDataChannel(dataChannels.get(name));

                peerConnections.get(name).createOffer()
                    .then(function (offer) {
                        return peerConnections.get(name).setLocalDescription(offer);
                    })
                    .then(function () {
                        send({ type: "offer", name: name, offer: peerConnections.get(name).localDescription });
                    })
                    .catch(function (error) {
                        console.log("Error creating or setting offer:", error);
                    });
                
            });
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
function setupPeerConnection(nameOfPeer) {
    peerConnections.set(nameOfPeer, new RTCPeerConnection(configuration))

    peerConnections.get(nameOfPeer).onicecandidate = function (event) {
        if (event.candidate) {
            send({
                type: "candidate",
                name: nameOfPeer,
                candidate: event.candidate
            });
        }
    };
    peerConnections.get(nameOfPeer).ondatachannel = function (event) {
        dataChannels.set(nameOfPeer, event.channel)
       openDataChannel(dataChannels.get(nameOfPeer));
    };
}



// Handles the offer message forwarded via the server.
// This code is executed only as a Room owner.
function onOfferResponse(offer, name) {
    peerConnections.set(name, new RTCPeerConnection(configuration))
    displayRoomStatus(name + " has joined the room");
    addUser(name, 'participant');

    peerConnections.get(name).setRemoteDescription(new RTCSessionDescription(offer))
    .then(function() {
        return peerConnections.get(name).createAnswer();
    })
    .then(function(answer) {
        return peerConnections.get(name).setLocalDescription(answer);
    })
    .then(function() {
        send({ type: "answer", name: name, answer: peerConnections.get(name).localDescription });
    })
    .catch(function(error) {
        console.log("Error handling offer or setting descriptions:", error);
    });
}

// Handles the answer message forwarded via the server.
// Only for the participant.
function onAnswerResponse(answer, name) {
    peerConnections.get(name).setRemoteDescription(new RTCSessionDescription(answer));
    displayRoomStatus(name + " has joined the room");
}

// The function that handles the candidate message forwarded via the server.
function onCandidateResponse(candidate, name) {
    peerConnections.get(name).addIceCandidate(new RTCIceCandidate(candidate))
    .then(function() {
        console.log("ICE candidate successfully added");
    })
    .catch(function(error) {
        console.log("Error adding ICE candidate:", error);
    });
}

// The function that handles leaving the WebRTC connection.
// We also have to initialize the peer connection again.
function onPeerLeaveResponse(name) {
    console.log("Peer closed connection");
    displayRoomStatus(name + ' has left the room');
    removeUser(name);
    
    peerConn = peerConnections.get(name);
    channel = dataChannels.get(name);

    if (peerConn != undefined) {
        peerConn.close();
        peerConnections.delete(name);
    }
    if (channel != undefined) {
        channel.close();
        dataChannels.delete(name);
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
function openDataChannel(dataChannel) {
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

    dataChannels.forEach((name, dataChannel) => {
        if (dataChannel && dataChannel.readyState === 'open') {
            dataChannel.send(JSON.stringify({
                sender: username,
                message: message
            }));
        } else {
            console.log("Data channel is not open. Unable to send message.");
        }
    });   
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

    peerConnections.forEach((name, peerConnection) => {
        if (peerConnection) {
            peerConnection.close();
        }
        peerConnections.delete(name);
    });

    dataChannels.forEach((name, dataChannel) => {
        if (dataChannel) {
            dataChannel.close();
        }
        dataChannels.delete(name);
    });
    
    socket.close();
    window.location.href = '/'
})