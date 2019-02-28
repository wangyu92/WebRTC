'use strict';

$(function() {
    ////////////////////////////////////////////////////////////////////////////
    //  connecting to html elements & events

    //  Videos
    let localVideo = document.querySelector('#local-video');
    let remoteVideo = document.querySelector('#remote-video');

    //  Buttons
    let $getStreamButton = $('#btn-getstream');
    let $callButton = $("#btn-call");
    let $hangupButton = $("#btn-hangup");

    //  events
    $getStreamButton.click(function() {
        navigator.mediaDevices.getUserMedia(mediaStreamConstraints)
            .then(gotLocalMediaStream).catch(handleLocalMediaStreamError);
    });

    $callButton.click(function() {
        doCall();
    });

    $hangupButton.click(function() {
        hangup()
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

        $getStreamButton.prop("disabled", true);

        sendMessage('got user media');
        if (isInitiator) {
            maybeStart();
        }
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

    let startTime = null;

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
    //  Signaling



    var isChannelReady = false;
    var isInitiator = false;
    var isStarted = false;
    var pc;
    var turnReady;

    var pcConfig = {
        'iceServers': [{
            'urls': 'stun:stun.l.google.com:19302'
        }]
    };

    // Set up audio and video regardless of what devices are present.
    var sdpConstraints = {
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
    };

    /////////////////////////////////////////////

    var room = 'foo';

    var socket = io("https://ms.hanyang.ac.kr:8800").connect();

    if (room !== '') {
        socket.emit('create or join', room);
        console.log('Attempted to create or  join room', room);
    }

    socket.on('created', function(room) {
        console.log('Created room ' + room);
        isInitiator = true;
    });

    socket.on('full', function(room) {
        console.log('Room ' + room + ' is full');
    });

    socket.on('join', function(room) {
        console.log('Another peer made a request to join room ' + room);
        console.log('This peer is the initiator of room ' + room + '!');
        isChannelReady = true;
    });

    socket.on('joined', function(room) {
        console.log('joined: ' + room);
        isChannelReady = true;
    });

    socket.on('log', function(array) {
        console.log.apply(console, array);
    });

    ////////////////////////////////////////////////

    function sendMessage(message) {
        console.log('Client sending message: ', message);
        socket.emit('message', message);
    }

    // This client receives a message
    socket.on('message', function(message) {
        console.log('Client received message:', message);
        if (message === 'got user media') {
            maybeStart();
        } else if (message.type === 'offer') {
            if (!isInitiator && !isStarted) {
                maybeStart();
            }
            pc.setRemoteDescription(new RTCSessionDescription(message));
            doAnswer();
        } else if (message.type === 'answer' && isStarted) {
            pc.setRemoteDescription(new RTCSessionDescription(message));
        } else if (message.type === 'candidate' && isStarted) {
            var candidate = new RTCIceCandidate({
                sdpMLineIndex: message.label,
                candidate: message.candidate
            });
            pc.addIceCandidate(candidate);
        } else if (message === 'bye' && isStarted) {
            handleRemoteHangup();
        }
    });

    ////////////////////////////////////////////////////

    function maybeStart() {
        console.log('>>>>>>> maybeStart() ', isStarted, localStream, isChannelReady);
        if (!isStarted && typeof localStream !== 'undefined' && isChannelReady) {
            console.log('>>>>>> creating peer connection');
            createPeerConnection();
            pc.addStream(localStream);
            isStarted = true;
            console.log('isInitiator', isInitiator);
            if (isInitiator) {
                $callButton.prop("disabled", false);
            }
        }
    }

    window.onbeforeunload = function() {
        sendMessage('bye');
    };

    /////////////////////////////////////////////////////////

    function createPeerConnection() {
        try {
            pc = new RTCPeerConnection(null);
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

    function handleCreateOfferError(event) {
        console.log('createOffer() error: ', event);
    }

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

    function onCreateSessionDescriptionError(error) {
        trace('Failed to create session description: ' + error.toString());
    }

    function requestTurn(turnURL) {
        var turnExists = false;
        for (var i in pcConfig.iceServers) {
            if (pcConfig.iceServers[i].urls.substr(0, 5) === 'turn:') {
                turnExists = true;
                turnReady = true;
                break;
            }
        }
        if (!turnExists) {
            console.log('Getting TURN server from ', turnURL);
            // No TURN server. Get one from computeengineondemand.appspot.com:
            var xhr = new XMLHttpRequest();
            xhr.onreadystatechange = function() {
                if (xhr.readyState === 4 && xhr.status === 200) {
                    var turnServer = JSON.parse(xhr.responseText);
                    console.log('Got TURN server: ', turnServer);
                    pcConfig.iceServers.push({
                        'urls': 'turn:' + turnServer.username + '@' + turnServer.turn,
                        'credential': turnServer.password
                    });
                    turnReady = true;
                }
            };
            xhr.open('GET', turnURL, true);
            xhr.send();
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
    //  Utils

    // Gets the "other" peer connection.
    function getOtherPeer(peerConnection) {
        return (peerConnection === localPeerConnection) ?
            remotePeerConnection : localPeerConnection;
    }

    // Gets the name of a certain peer connection.
    function getPeerName(peerConnection) {
        return (peerConnection === localPeerConnection) ?
            'localPeerConnection' : 'remotePeerConnection';
    }

    // Logs an action (text) and the time when it happened on the console.
    function trace(text) {
        text = text.trim();
        const now = (window.performance.now() / 1000).toFixed(3);

        console.log(now, text);
    }

});
