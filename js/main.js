"use strict";

let pc;

const iceServers = {
    // 'iceTransportPolicy': 'relay',
    'iceServers': [{
            'urls': [
                'stun:stun.l.google.com:19302',
                'stun:stun1.l.google.com:19302',
                'stun:stun2.l.google.com:19302'
            ]
        },
        {
            'urls': [
                'turn:ms.hanyang.ac.kr:8801'
            ],
            'credential': 'doqemddl',
            'username': 'wangyu'
        },
        {
            'urls': [
                'turns:ms.hanyang.ac.kr:8802'
            ],
            'credential': 'doqemddl',
            'username': 'wangyu'
        }
    ]
};

let signalingClient = new SignalingClient(iceServers);
let peerConnectionController = new PeerConnectionController();
let room;

////////////////////////////////////////////////////////////////////////////
//  connecting to html elements & events

//  Videos
let localVideo = document.querySelector('#local-video');
let remoteVideo = document.querySelector('#remote-video');

//  Buttons
let getStreamButton = document.querySelector('#btn-getstream');
let callButton = document.querySelector('#btn-call');
let hangupButton = document.querySelector('#btn-hangup');

//  events
getStreamButton.onclick = function() {
    room = window.prompt("Enter room name : ");
    signalingClient.joinRoom(room);

    navigator.mediaDevices.getUserMedia(mediaStreamConstraints)
        .then(gotLocalMediaStream).catch(handleLocalMediaStreamError);
};

callButton.onclick = function() {
    peerConnectionController.call();
};

hangupButton.onclick = function() {
    hangup();
    handleRemoteHangup();
};

////////////////////////////////////////////////////////////////////////////
//  Inbox
function tryToConnectAndAddStream() {
    if(!signalingClient.isStarted() && typeof localStream !== 'undefined') {
        peerConnectionController.createConnection(iceServers);
        peerConnectionController.addStream(localStream);

        if (signalingClient._initiator) {
            callButton.disabled = false;
        }
    }
}

////////////////////////////////////////////////////////////////////////////
//  Set event listener for signaling
signalingClient.setEventListener('created', room => {
    console.log('Created room = ' + room);
});

signalingClient.setEventListener('joined', room => {
    console.log('joined: ' + room);
});

signalingClient.setEventListener('join', room => {
    console.log('Another peer made a request to join room ' + room);
    console.log('This peer is the initiator of room ' + room + '!');
});

signalingClient.setEventListener('message', message => {
    console.log('Client received message:', message);

    //  Signaling를 통해 상대방이 Media Stream을 열면 해당 메시지를 수신.
    if (message === 'got user media') {
        tryToConnectAndAddStream();
    }

    //  offer 메시지를 받았을 때
    //  일반적으로 방 생성자가 아닌 사람이 수신
    else if (message.type === 'offer') {
        if (!signalingClient.isInitiator() && !signalingClient.isStarted()) {
            tryToConnectAndAddStream();
        }
        peerConnectionController.setRemoteDescription(new RTCSessionDescription(message));
        peerConnectionController.answer();
    }

    //  answer 메시지를 받았을 때
    else if (message.type === 'answer' && signalingClient.isStarted()) {
        if(signalingClient.isStarted()) {
            peerConnectionController.setRemoteDescription(new RTCSessionDescription(message));
        }
    }

    else if (message.type === 'candidate' && signalingClient.isStarted()) {
        peerConnectionController.addIceCandidate(message);
    }

    else if (message === 'bye' && signalingClient.isStarted()) {
        handleRemoteHangup();
    }
});

signalingClient.setEventListener('connect_error', error => {
    getStreamButton.disabled = true;
    hangupButton.disabled = true;
});

////////////////////////////////////////////////////////////////////////////
//  Set event listener for PeerConnectionController
peerConnectionController.setEventListener('peer connection created', () => {
    signalingClient.setStarted(true);
});

peerConnectionController.setEventListener('peer connection failed', (e) => {
    signalingClient.setStarted(false);
});

peerConnectionController.setEventListener('handleIceCandidate', (event) => {
    console.log('icecandidate event: ', event);
    if (event.candidate) {
        signalingClient.sendMessage({
            type: 'candidate',
            label: event.candidate.sdpMLineIndex,
            id: event.candidate.sdpMid,
            candidate: event.candidate.candidate
        });
    } else {
        console.log('End of candidates.');
    }
});

peerConnectionController.setEventListener('handleRemoteStreamAdded', (event) => {
    console.log('Remote stream added.');
    remoteStream = event.stream;
    remoteVideo.srcObject = remoteStream;
});

peerConnectionController.setEventListener('handleRemoteStreamRemoved', (event) => {
    console.log('Remote stream removed. Event: ', event);
});

peerConnectionController.setEventListener('setLocalAndSendMessage', (sessionDescription) => {
    console.log('setLocalAndSendMessage sending message', sessionDescription);
    signalingClient.sendMessage(sessionDescription);
});

peerConnectionController.setEventListener('handleCreateOfferError', (event) => {
    console.log('createOffer() error: ', event);
});

peerConnectionController.setEventListener('onCreateSessionDescriptionError', (error) => {
    trace('Failed to create session description: ' + error.toString());
});

////////////////////////////////////////////////////////////////////////////
//  Get video stream

//  Global variables
let localStream;
let remoteStream;

const mediaStreamConstraints = {
    video: true,
    audio: false,
};

// Handles success by adding the MediaStream to the video element.
function gotLocalMediaStream(mediaStream) {
    localStream = mediaStream;
    localVideo.srcObject = mediaStream;

    getStreamButton.disabled = true;

    signalingClient.sendMessage('got user media');
}

function gotRemoteMediaStream(event) {
    const mediaStream = event.stream;
    remoteVideo.srcObject = mediaStream;
    remoteStream = mediaStream;

    trace('Remote peer connection received remote stream.');
}

// Handles error by logging a message to the console with the error message.
function handleLocalMediaStreamError(error) {
    console.log('navigator.getUserMedia error: ', error);
}

window.onbeforeunload = function() {
    signalingClient.sendMessage('bye');
};

////////////////////////////////////////////////////////////////////////////


function hangup() {
    console.log('Hanging up.');
    stop();
    signalingClient.sendMessage('bye');
}

function handleRemoteHangup() {
    console.log('Session terminated.');
    stop();
    signalingClient._initiator = false;
}

function stop() {
    signalingClient._started = false;
    pc.close();
    pc = null;
}

// Logs an action (text) and the time when it happened on the console.
function trace(text) {
    text = text.trim();
    const now = (window.performance.now() / 1000).toFixed(3);

    console.log(now, text);
}
