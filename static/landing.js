var createRoomButton= document.querySelector('#create-room-btn'); 
var joinRoomButton = document.querySelector('#join-room-btn'); 

window.RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
window.RTCIceCandidate = window.RTCIceCandidate || window.mozRTCIceCandidate || window.webkitRTCIceCandidate;
window.RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription || window.webkitRTCSessionDescription;

var connectedUser, peerConnection, dataChannel;

var connection = new WebSocket('ws://localhost:9090/websocket'); 

connection.onmessage = function (message) { 
    var data = JSON.parse(message.data); 
    
    switch(data.type) { 
        case "login": 
	        //onLogin(data.success); 
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
        case "users":
            onUsers(data.users);
        default: 
            break; 
    } 
}; 

connection.onopen = function () { 
    console.log("Connected to the signaling server."); 
}; 
 
connection.onerror = function (err) { 
    console.log("Got error on trying to connect to the signaling server:", err); 
};



createRoomButton.addEventListener("click", async function() {
    const name = document.querySelector('#name').value; 
    if (name) {
        alert("Creating room for " + name);
        await login(name);
        console.log('User has login')
        
    } else {
        alert("Please enter a name");
    }
});

joinRoomButton.addEventListener("click", async function() {
    const name = document.querySelector('#name').value; 
    if (!name) {
        alert("Please enter a name");
    } else {
        const roomCode = prompt("Please enter the 4-letter room code:");
        if(roomCode.length > 0) {

            try {
                await login(name);
                console.log('User has login')
                var dataChannelOptions = { 
                    reliable: true
                }; 
                dataChannel = peerConnection.createDataChannel(connectedUser + "-dataChannel", dataChannelOptions);
                openDataChannel()
                console.log("Data channel opened")
                peerConnection.createOffer(function (offer) { 
                    send({ 
                        type: "offer", 
                        offer: offer 
                        }); 
                peerConnection.setLocalDescription(offer); 
                }, function (error) { 
                console.log("Error: ", error); 
                console.log("Error contacting remote peer: " + error, "server");
                });
            } catch (err){
                console.log(err);
            }
        }
    }
});


function login(name) {
    return new Promise((resolve, reject) => {
        function handleLoginResponse(message) {
            var data = JSON.parse(message.data);
            if (data.type === "login") {
                connection.removeEventListener('message', handleLoginResponse);
                if (data.success) {
                    //Known ICE Servers
        var configuration = { 
            "iceServers": [{ "urls": "stun:stun.1.google.com:19302" }] 
	    }; 

        peerConnection = new RTCPeerConnection(configuration);

        //Definition of the data channel
        peerConnection.ondatachannel = function(ev) {
            dataChannel = ev.channel;
            openDataChannel()
        };
        console.log("Connected to server.");
      
        //When we get our own ICE Candidate, we provide it to the other Peer.
        peerConnection.onicecandidate = function (event) { 
            if (event.candidate) { 
                send({ 
                    type: "candidate", 
                    candidate: event.candidate 
                    });
            } 
        };
          peerConnection.oniceconnectionstatechange = function(e) {
              var iceState = peerConnection.iceConnectionState;
              console.log("Changing connection state:", iceState)
              if (iceState == "connected") {
                console.log("Connection established with user " + connectedUser);
              } else if (iceState =="disconnected" || iceState == "closed") {
                  onLeave();
              }
          };
                    resolve();
                } else {
                    reject("Login failed");
                }
            }
        }
        connection.addEventListener('message', handleLoginResponse);
        send({
            type: "login",
            name: name
        });
    });
}

//When we are receiving an offer from a remote peer
function onOffer(offer, name) { 
    connectedUser = name; 
    peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

    peerConnection.createAnswer(function (answer) { 
	    peerConnection.setLocalDescription(answer);  
	    send({ 
		    type: "answer", 
			answer: answer 
			}); 
	    
	}, function (error) { 
	    console.log("Error on receiving the offer: ", error); 
	    writetochat("Error on receiving offer from remote peer: " + error, "server");
	}); 
}

//Changes the remote description associated with the connection 
function onAnswer(answer) { 
    peerConnection.setRemoteDescription(new RTCSessionDescription(answer)); 
}
  
//Adding new ICE candidate
function onCandidate(candidate) { 
    peerConnection.addIceCandidate(new RTCIceCandidate(candidate)); 
    console.log("ICE Candidate added.");
}

//Leave sent by the signaling server or remote peer
function onLeave() {
    try {
        peerConnection.close();
        console.log("Connection closed by " + connectedUser);
        console.log(capitalizeFirstLetter(connectedUser) + " closed the connection.", "server");
    } catch(err) {
        console.log("Connection already closed");
    }
}

//Received list of users by the signaling server
function onUsers(users) {
    var div = document.getElementById('userbox');
    data = '<font color="white">'
    for (var i = 0; i < users.length; i++) {
        if (users[i] != name && users[i] != "") {
            data = data + users[i] + '<br>';
        }
    }
    data = data + '</font>';
    div.innerHTML = data;
}

function send(message) { 
    if (connectedUser) { 
	    message.name = connectedUser; 
    } 
    connection.send(JSON.stringify(message)); 
};


function openDataChannel() { 
    dataChannel.onerror = function (error) { 
	    console.log("Error on data channel:", error); 
	    console.log("Error: " + error);
    };
    
    dataChannel.onmessage = function (event) { 
        console.log("Message received:", event.data); 
        console.log(event.data + " from " + connectedUser);
    };  

    dataChannel.onopen = function() {
        console.log("Channel established.");
    };

    dataChannel.onclose = function() {
        console.log("Channel closed.");
    };
}
