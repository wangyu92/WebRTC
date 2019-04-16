"use strict";

var isChannelReady = false;
var isInitiator = false;
var isStarted = false;
var pc;
var turnReady;

let room = window.prompt("Enter room name : ");

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

////////////////////////////////////////////////////////////////////////////
//  connecting to html elements & events

}
//  Videos
let localVideo = document.querySelector('#local-video');
let remoteVideo = document.querySelector('#remote-video');

//  Buttons
let getStreamButton = document.querySelector('#btn-getstream');
let callButton = document.querySelector('#btn-call');
let hangupButton = document.querySelector('#btn-hangup');

//  events
getStreamButton.onclick = function() {
    connectSignalingServer();

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

    sendMessage('got user media');
    if (isInitiator) {
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


////////////////////////////////////////////////////////////////////////////
//  PeerConnection

function maybeStart() {
    console.log('>>>>>>> maybeStart() ', isStarted, localStream, isChannelReady);
    if (!isStarted && typeof localStream !== 'undefined' && isChannelReady) {
        console.log('>>>>>> creating peer connection');
        createPeerConnection();
        pc.addStream(localStream);
        isStarted = true;
        console.log('isInitiator', isInitiator);
        if (isInitiator) {
            callButton.disabled = false;
        }
    }
}

function createPeerConnection() {
    try {
        pc = new RTCPeerConnection(iceServers);
        pc.onicecandidate = handleIceCandidate;
        pc.onaddstream = handleRemoteStreamAdded;
        pc.onremovestream = handleRemoteStreamRemoved;
        console.log('Created RTCPeerConnnection');
    } catch (e) {
        console.log('Failed to create PeerConnection, exception: ' + e.message);
        alert('Cannot create RTCPeerConnection object.');
        return;
    }
}

function handleIceCandidate(event) {
    console.log('icecandidate event: ', event);
    if (event.candidate) {
        sendMessage({
            type: 'candidate',
            label: event.candidate.sdpMLineIndex,
            id: event.candidate.sdpMid,
            candidate: event.candidate.candidate
        });
    } else {
        console.log('End of candidates.');
    }
}

function handleRemoteStreamAdded(event) {
    console.log('Remote stream added.');
    remoteStream = event.stream;
    remoteVideo.srcObject = remoteStream;
}

function handleRemoteStreamRemoved(event) {
    console.log('Remote stream removed. Event: ', event);
}

window.onbeforeunload = function() {
    sendMessage('bye');
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
    sendMessage(sessionDescription);
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
    sendMessage('bye');
}

function handleRemoteHangup() {
    console.log('Session terminated.');
    stop();
    isInitiator = false;
}

function stop() {
    isStarted = false;
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

function sendMessage(message) {
    console.log('Client sending message: ', message);
    socket.emit('message', message);
}

// Logs an action (text) and the time when it happened on the console.
function trace(text) {
    text = text.trim();
    const now = (window.performance.now() / 1000).toFixed(3);

    console.log(now, text);
}
