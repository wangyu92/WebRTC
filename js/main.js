"use strict";

let pc;
let turnReady;

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
    doCall();
};

hangupButton.onclick = function() {
    hangup();
    handleRemoteHangup();
};

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

    if (message === 'got user media') {
        maybeStart();
    } else if (message.type === 'offer') {
        if (!signalingClient.isInitiator() && !signalingClient.isStarted()) {
            maybeStart();
        }
        pc.setRemoteDescription(new RTCSessionDescription(message));
        doAnswer();
    } else if (message.type === 'answer' && signalingClient.isStarted()) {
        pc.setRemoteDescription(new RTCSessionDescription(message));
    } else if (message.type === 'candidate' && signalingClient.isStarted()) {
        var candidate = new RTCIceCandidate({
            sdpMLineIndex: message.label,
            candidate: message.candidate
        });
        pc.addIceCandidate(candidate);
    } else if (message === 'bye' && signalingClient.isStarted()) {
        handleRemoteHangup();
    }
});

signalingClient.setEventListener('connect_error', error => {
    getStreamButton.disabled = true;
    hangupButton.disabled = true;
});

////////////////////////////////////////////////////////////////////////////
//  Get video stream

//  Global variables
let localStream;
let remoteStream;

const mediaStreamConstraints = {
    video: true,
    audio: true,
};

// Handles success by adding the MediaStream to the video element.
function gotLocalMediaStream(mediaStream) {
    localStream = mediaStream;
    localVideo.srcObject = mediaStream;

    getStreamButton.disabled = true;

    signalingClient.sendMessage('got user media');
    if (signalingClient.isInitiator()) {
        maybeStart();
    }

    initBandwidthGraph();
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



////////////////////////////////////////////////////////////////////////////
//  Events for videos

function logVideoLoaded(event) {
    const video = event.target;
    trace(`${video.id} videoWidth: ${video.videoWidth}px, ` +
        `videoHeight: ${video.videoHeight}px.`);
}

// Logs a message with the id and size of a video element.
// This event is fired when video begins streaming.
function logResizedVideo(event) {
    logVideoLoaded(event);

    if (startTime) {
        const elapsedTime = window.performance.now() - startTime;
        startTime = null;
        trace(`Setup time: ${elapsedTime.toFixed(3)}ms.`);
    }
}

localVideo.addEventListener('loadedmetadata', logVideoLoaded);
remoteVideo.addEventListener('loadedmetadata', logVideoLoaded);
remoteVideo.addEventListener('onresize', logResizedVideo);

window.onbeforeunload = function() {
    signalingClient.sendMessage('bye');
};

////////////////////////////////////////////////////////////////////////////

function doCall() {
    console.log('Sending offer to peer');
    pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);
}

function doAnswer() {
    console.log('Sending answer to peer.');
    pc.createAnswer().then(
        setLocalAndSendMessage,
        onCreateSessionDescriptionError
    );
}

function setLocalAndSendMessage(sessionDescription) {
    pc.setLocalDescription(sessionDescription);
    console.log('setLocalAndSendMessage sending message', sessionDescription);
    signalingClient.sendMessage(sessionDescription);
}

function handleCreateOfferError(event) {
    console.log('createOffer() error: ', event);
}

function onCreateSessionDescriptionError(error) {
    trace('Failed to create session description: ' + error.toString());
}

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



////////////////////////////////////////////////////////////////////////////
//  Bandwidth

let bandwidthSelector = document.querySelector('select#bandwidth');


let maxBandwidth = 0;

let bitrateGraph;
let bitrateSeries;

let packetGraph;
let packetSeries;

let lastResult;

function initBandwidthGraph() {
    bitrateSeries = new TimelineDataSeries();
    bitrateGraph = new TimelineGraphView('bitrateGraph', 'bitrateCanvas');
    bitrateGraph.updateEndDate();

    packetSeries = new TimelineDataSeries();
    packetGraph = new TimelineGraphView('packetGraph', 'packetCanvas');
    packetGraph.updateEndDate();
}

// renegotiate bandwidth on the fly.
bandwidthSelector.onchange = () => {
    bandwidthSelector.disabled = true;
    const bandwidth = bandwidthSelector.options[bandwidthSelector.selectedIndex].value;

    // In Chrome, use RTCRtpSender.setParameters to change bandwidth without
    // (local) renegotiation. Note that this will be within the envelope of
    // the initial maximum bandwidth negotiated via SDP.
    if ((adapter.browserDetails.browser === 'chrome' ||
            (adapter.browserDetails.browser === 'firefox' &&
                adapter.browserDetails.version >= 64)) &&
        'RTCRtpSender' in window &&
        'setParameters' in window.RTCRtpSender.prototype) {
        const sender = pc.getSenders()[0];
        const parameters = sender.getParameters();
        if (!parameters.encodings) {
            parameters.encodings = [{}];
        }
        if (bandwidth === 'unlimited') {
            delete parameters.encodings[0].maxBitrate;
        } else {
            parameters.encodings[0].maxBitrate = bandwidth * 1000;
        }
        sender.setParameters(parameters)
            .then(() => {
                bandwidthSelector.disabled = false;
            })
            .catch(e => console.error(e));
        return;
    }
    // Fallback to the SDP munging with local renegotiation way of limiting
    // the bandwidth.
    pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .then(() => {
            const desc = {
                type: pc.remoteDescription.type,
                sdp: bandwidth === 'unlimited' ?
                    removeBandwidthRestriction(pc.remoteDescription.sdp) : updateBandwidthRestriction(pc.remoteDescription.sdp, bandwidth)
            };
            console.log('Applying bandwidth restriction to setRemoteDescription:\n' +
                desc.sdp);
            return pc.setRemoteDescription(desc);
        })
        .then(() => {
            bandwidthSelector.disabled = false;
        })
        .catch(onSetSessionDescriptionError);
};

function updateBandwidthRestriction(sdp, bandwidth) {
    let modifier = 'AS';
    if (adapter.browserDetails.browser === 'firefox') {
        bandwidth = (bandwidth >>> 0) * 1000;
        modifier = 'TIAS';
    }
    if (sdp.indexOf('b=' + modifier + ':') === -1) {
        // insert b= after c= line.
        sdp = sdp.replace(/c=IN (.*)\r\n/, 'c=IN $1\r\nb=' + modifier + ':' + bandwidth + '\r\n');
    } else {
        sdp = sdp.replace(new RegExp('b=' + modifier + ':.*\r\n'), 'b=' + modifier + ':' + bandwidth + '\r\n');
    }
    return sdp;
}

function removeBandwidthRestriction(sdp) {
    return sdp.replace(/b=AS:.*\r\n/, '').replace(/b=TIAS:.*\r\n/, '');
}

// query getStats every second
window.setInterval(() => {
    if (!pc) {
        return;
    }
    const sender = pc.getSenders()[0];
    if (!sender) {
        return;
    }
    sender.getStats().then(res => {
        res.forEach(report => {
            let bytes;
            let packets;
            if (report.type === 'outbound-rtp') {
                if (report.isRemote) {
                    return;
                }
                const now = report.timestamp;
                bytes = report.bytesSent;
                packets = report.packetsSent;
                if (lastResult && lastResult.has(report.id)) {
                    // calculate bitrate
                    const bitrate = 8 * (bytes - lastResult.get(report.id).bytesSent) /
                        (now - lastResult.get(report.id).timestamp);

                    // append to chart
                    bitrateSeries.addPoint(now, bitrate);
                    bitrateGraph.setDataSeries([bitrateSeries]);
                    bitrateGraph.updateEndDate();

                    // calculate number of packets and append to chart
                    packetSeries.addPoint(now, packets -
                        lastResult.get(report.id).packetsSent);
                    packetGraph.setDataSeries([packetSeries]);
                    packetGraph.updateEndDate();
                }
            }
        });
        lastResult = res;
    });
}, 1000);


////////////////////////////////////////////////////////////////////////////
//  Utils & for log

let startTime = null;



// Logs an action (text) and the time when it happened on the console.
function trace(text) {
    text = text.trim();
    const now = (window.performance.now() / 1000).toFixed(3);

    console.log(now, text);
}
