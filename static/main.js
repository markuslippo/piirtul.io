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
        roomID = user.roomID;
        initializeWebSocket();
    }

    initializeCanvasEvents();
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
        console.log("✅ Connected to WebSocket.");
        initiateUser();
    };

    socket.onerror = (err) => {
        console.log("❌ WebSocket error:", err);
    };

    // Then we wait and listen for messages.
    socket.onmessage = function(message) {
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
                onPeerLeaveResponse(data.name, data.room_destroy);
                break;
            case "leaveConfirmed":
                leave();
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
    console.log("❓ Sent initiation")
    addUser(username, role);
    send({type: 'initiation', name: username });
}

// Handles the initiation response from the server.
function onInitiationResponse(success) {
    if (success === true) {
        console.log("✅ Initiation successful");

        switch(role) {
            case 'creator':
                roomID = generateRoomID(4);
                console.log("❓ Sent room initiation")
                send({ type: 'roomInitiation', room_id: roomID, name: username, role: 'creator' });
                break;
            case 'participant':
                console.log("❓ Sent room initiation")
                send({ type: 'roomInitiation', room_id: roomID, name: username, role: 'participant' });
                break;
            default:
                console.log("Unknown message type:", data.type);
                break;
        }
    } else {
        alert('An error occured in initialization')
        window.location.href = '/'
    }
}

// Handles the room initiation response from the server. 
function onRoomInitiationResponse(success, newRoomID, participants) {
    if (success) {
        console.log("✅ Room initiation successful");
        roomID = newRoomID
        roomIDBanner.innerHTML += roomID;

        if (role === "participant") {
            participants.forEach(name => {
                setupPeerConnection(name);
                addUser(name, 'participant');

                console.log("✅ Created data channel with ", name)
                const dataChannel = peerConnections.get(name).createDataChannel(`${username}-${name}`, { reliable: true });
                dataChannels.set(name, dataChannel);
                openDataChannel(dataChannel);
                console.log("✅ Opened data channel with ", name)

                peerConnections.get(name).createOffer()
                    .then(function (offer) {
                        return peerConnections.get(name).setLocalDescription(offer);
                    })
                    .then(function () {
                        console.log("❓Sent offer to ", name)
                        send({ type: "offer", name: name, offer: peerConnections.get(name).localDescription });
                    })
                    .catch(function (error) {
                        console.log("Error creating or setting offer:", error);
                    });
                
            });
        }
    } else {
        alert("An error occured when joining the room.");
        window.location.href = '/';
    }
}

// Create a new RTCPeerConnection with the configuration
// Initiate connection to handle upcoming ICE candidate event.
// After both parties have their answer/offers, they start to exchange the candidates automatically.
// Initiate connection to handle upcoming data channel event
function setupPeerConnection(nameOfPeer) {
    const peerConnection = new RTCPeerConnection(configuration);
    peerConnections.set(nameOfPeer, peerConnection);

    peerConnection.onicecandidate = function (event) {
        if (event.candidate) {
            send({
                type: "candidate",
                name: nameOfPeer,
                candidate: event.candidate
            });
        }
    };

    peerConnection.ondatachannel = function (event) {
        const dataChannel = event.channel;
        dataChannels.set(nameOfPeer, dataChannel);
        openDataChannel(dataChannel); 
    };
}



// Handles the offer message forwarded via the server.
// This code is executed only as a Room owner.
function onOfferResponse(offer, name) {
    console.log("✅ Offer received")
    const peerConnection = new RTCPeerConnection(configuration);
    peerConnections.set(name, peerConnection);

    displayRoomStatus(name + " has joined the room");
    addUser(name, 'participant');

    peerConnection.onicecandidate = function (event) {
        if (event.candidate) {
            send({
                type: "candidate",
                name: name,
                candidate: event.candidate
            });
        }
    };

    peerConnection.ondatachannel = function (event) {
        const dataChannel = event.channel;
        dataChannels.set(name, dataChannel);
        openDataChannel(dataChannel);
    };

    // Set up the peer connection to handle the offer
    peerConnection.setRemoteDescription(new RTCSessionDescription(offer))
    .then(() => peerConnection.createAnswer())
    .then(answer => peerConnection.setLocalDescription(answer))
    .then(() => {
        console.log("❓Sent answer to ", name)
        send({ type: "answer", name: name, answer: peerConnection.localDescription });
    })
    .catch(error => console.log("Error handling offer or setting descriptions:", error));
}




// Handles the answer message forwarded via the server.
// Only for the participant.
function onAnswerResponse(answer, name) {
    console.log("✅ Received answer from ", name)
    peerConnections.get(name).setRemoteDescription(new RTCSessionDescription(answer));
    displayRoomStatus(name + " has joined the room");
}

// The function that handles the candidate message forwarded via the server.
function onCandidateResponse(candidate, name) {
    peerConnections.get(name).addIceCandidate(new RTCIceCandidate(candidate))
    .then(function() {
        console.log("✅ ICE candidate added with ", name);
    })
    .catch(function(error) {
        console.log("❌ Error adding ICE candidate:", error);
    });
}

// The function that handles leaving the WebRTC connection.
// We also have to initialize the peer connection again.
function onPeerLeaveResponse(name, destroyRoom) {
    console.log("✅ " + name + " has left the room.");
    displayRoomStatus(name + ' has left the room.');
    removeUser(name);
    
    if(destroyRoom) {
        console.log("Owner left, room is closing...")
        sendLeave();
    } else {
        peerConn = peerConnections.get(name);
        channel = dataChannels.get(name);
        if (channel != undefined) {
            channel.close();
            dataChannels.delete(name);
        }
        if (peerConn != undefined) {
            peerConn.close();
            peerConnections.delete(name);
        }
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
function openDataChannel(dataChannel) {
    dataChannel.onmessage = function (event) {
        var receivedData = JSON.parse(event.data);
        if (receivedData.type === 'drawing') {
            drawOnCanvas(receivedData);
        } else if (receivedData.type === "clear") {
            clearCanvas();
        }else if (receivedData.type === 'chat') {
            displayMessage(receivedData.sender, receivedData.message);
        }        
       
    };
    dataChannel.onerror = function (error) {
        console.log("❌ Data Channel Error:", error);
    };
}

// The function that sends a message to the peer.
function sendMessage(message) {

    const chatmessage = {
        type: 'chat',
        sender: username,
        message: message
    };

    dataChannels.forEach((dataChannel, name) => {
        if (dataChannel && dataChannel.readyState === 'open') {
            console.log("✅ Sent message to ", name);
            dataChannel.send(JSON.stringify(chatmessage));
        } else {
            console.log("❌ Unable to send message since datachannel is not open");
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
    const statusItem = document.createElement('li');
    statusItem.textContent = status;
    roomStatus.appendChild(statusItem);
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

function leave() {
    console.log("✅ Leaving room")
    dataChannels.forEach((dataChannel, name) => {
        if (dataChannel) {
            dataChannel.close();
        }
    });
    dataChannels.clear();
    peerConnections.forEach((peerConnection, name) => {
        if (peerConnection) {
            peerConnection.close();
        }
    });
    peerConnections.clear();
    socket.close();
    alert("Leaving room.")
    window.location.href = '/';
}

function sendLeave() {
    console.log("❓ Sending leave")
    send({ type: 'leaveRoom'});
}

quitButton.addEventListener('click', () => {
    sendLeave();
})


// Drawing
const canvas = document.getElementById('drawing-canvas');
const ctx = canvas.getContext('2d');

let isDrawing = false;
let penColor = '#fcfafa';
let penThickness = 2;
let prevX, prevY;

const thicknessSelect = document.getElementById('pen-thickness');
const colorPicker = document.getElementById('color-picker');
const clearCanvasButton = document.getElementById('clear-canvas');

colorPicker.addEventListener('input', (e) => penColor = e.target.value);
thicknessSelect.addEventListener('change', (e) => penThickness = parseInt(e.target.value));

function resizeCanvas() {
    const container = canvas.parentElement;
    canvas.width = container.clientWidth * 0.9;
    canvas.height = container.clientHeight * 0.9;
    
    // Reset canvas context properties after resize
    ctx.strokeStyle = penColor;
    ctx.lineWidth = penThickness;
    ctx.lineCap = 'round';
}

function initializeCanvasEvents() {
    // Add drawing events for all users (both creator and participants)
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseleave', stopDrawing);
    
    // Touch events support
    canvas.addEventListener('touchstart', handleTouchStart);
    canvas.addEventListener('touchmove', handleTouchMove);
    canvas.addEventListener('touchend', stopDrawing);
    
    if (clearCanvasButton) {
        clearCanvasButton.addEventListener('click', clearCanvas);
    }
}

function startDrawing(e) {
    isDrawing = true;
    const coords = getCoordinates(e);
    prevX = coords.x;
    prevY = coords.y;
    
    // Start new path
    ctx.beginPath();
    ctx.moveTo(prevX, prevY);
    ctx.strokeStyle = penColor;
    ctx.lineWidth = penThickness;
    ctx.lineCap = 'round';
    
    // Prevent scrolling on touch devices
    e.preventDefault();
}

function draw(e) {
    if (!isDrawing) return;
    
    const coords = getCoordinates(e);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();

    const drawingData = {
        type: 'drawing',
        prevX: prevX,
        prevY: prevY,
        x: coords.x,
        y: coords.y,
        color: penColor,
        thickness: penThickness
    };
    sendDrawingData(drawingData);
    
    
    prevX = coords.x;
    prevY = coords.y;
    
    e.preventDefault();
}

function stopDrawing() {
    isDrawing = false;
    ctx.beginPath(); // Reset the path
}

function getCoordinates(e) {
    let x, y;
    
    if (e.type.includes('touch')) {
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        x = touch.clientX - rect.left;
        y = touch.clientY - rect.top;
    } else {
        x = e.offsetX;
        y = e.offsetY;
    }
    
    return { x, y };
}

function handleTouchStart(e) {
    e.preventDefault();
    startDrawing(e);
}

function handleTouchMove(e) {
    e.preventDefault();
    draw(e);
}

function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);    
    sendDrawingData({ type: 'clear' });
}

function sendDrawingData(data) {
    dataChannels.forEach((dataChannel) => {
        if (dataChannel && dataChannel.readyState === 'open') {
            dataChannel.send(JSON.stringify(data));
        }
    });
}

function drawOnCanvas(data) {
    if (data.type === 'clear') {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    } else if (data.type === 'drawing') {
        ctx.beginPath();
        ctx.moveTo(data.prevX, data.prevY);
        ctx.lineTo(data.x, data.y);
        ctx.strokeStyle = data.color;
        ctx.lineWidth = data.thickness;
        ctx.lineCap = 'round';
        ctx.stroke();
    }
}