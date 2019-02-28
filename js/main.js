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
        callAction();
    });

    $hangupButton.click(function() {
        hangupAction();
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
        // remoteVideo.srcObject = mediaStream;

        $callButton.prop("disabled", false);
        $getStreamButton.prop("disabled", true);
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
    //  Define RTC peer connection - local

    let localPeerConnection;
    let remotePeerConnection;

    const offerOptions = {
        offerToReceiveVideo: 1,
    };

    function callAction() {
        $callButton.prop("disabled", true);
        $hangupButton.prop("disabled", false);

        trace('Starting call.');
        startTime = window.performance.now();

        // Get local media stream tracks.
        const videoTracks = localStream.getVideoTracks();
        const audioTracks = localStream.getAudioTracks();
        if (videoTracks.length > 0) {
            trace(`Using video device: ${videoTracks[0].label}.`);
        }
        if (audioTracks.length > 0) {
            trace(`Using audio device: ${audioTracks[0].label}.`);
        }

        const servers = null; // Allows for RTC server configuration.

        // Create peer connections and add behavior.
        localPeerConnection = new RTCPeerConnection(servers);
        trace('Created local peer connection object localPeerConnection.');

        localPeerConnection.addEventListener('icecandidate', handleConnection);
        localPeerConnection.addEventListener('iceconnectionstatechange', handleConnectionChange);

        remotePeerConnection = new RTCPeerConnection(servers);
        trace('Created remote peer connection object remotePeerConnection.');

        remotePeerConnection.addEventListener('icecandidate', handleConnection);
        remotePeerConnection.addEventListener('iceconnectionstatechange', handleConnectionChange);
        remotePeerConnection.addEventListener('addstream', gotRemoteMediaStream);

        // Add local stream to connection and create offer to connect.
        localPeerConnection.addStream(localStream);
        trace('Added local stream to localPeerConnection.');

        trace('localPeerConnection createOffer start.');
        localPeerConnection.createOffer(offerOptions)
            .then(createdOffer).catch(setSessionDescriptionError);
    }


    function handleConnection(event) {
        const peerConnection = event.target;
        const iceCandidate = event.candidate;

        if (iceCandidate) {
            const newIceCandidate = new RTCIceCandidate(iceCandidate);
            const otherPeer = getOtherPeer(peerConnection);

            otherPeer.addIceCandidate(newIceCandidate).then(() => {
                handleConnectionSuccess(peerConnection);
            }).catch((error) => {
                handleConnectionFailure(peerConnection, error);
            });

            trace(`${getPeerName(peerConnection)} ICE candidate:\n` +
                `${event.candidate.candidate}.`);
        }
    }

    // Logs changes to the connection state.
    function handleConnectionChange(event) {
        const peerConnection = event.target;
        console.log('ICE state change event: ', event);
        trace(`${getPeerName(peerConnection)} ICE state: ` +
            `${peerConnection.iceConnectionState}.`);
    }

    // Logs offer creation and sets peer connection session descriptions.
    function createdOffer(description) {
        trace(`Offer from localPeerConnection:\n${description.sdp}`);

        trace('localPeerConnection setLocalDescription start.');
        localPeerConnection.setLocalDescription(description)
            .then(() => {
                setLocalDescriptionSuccess(localPeerConnection);
            }).catch(setSessionDescriptionError);

        trace('remotePeerConnection setRemoteDescription start.');
        remotePeerConnection.setRemoteDescription(description)
            .then(() => {
                setRemoteDescriptionSuccess(remotePeerConnection);
            }).catch(setSessionDescriptionError);

        trace('remotePeerConnection createAnswer start.');
        remotePeerConnection.createAnswer()
            .then(createdAnswer)
            .catch(setSessionDescriptionError);
    }







    ////////////////////////////////////////////////////////////////////////////
    //  Define RTC peer connection - remote

    // Logs answer to offer creation and sets peer connection session descriptions.
    function createdAnswer(description) {
        trace(`Answer from remotePeerConnection:\n${description.sdp}.`);

        trace('remotePeerConnection setLocalDescription start.');
        remotePeerConnection.setLocalDescription(description)
            .then(() => {
                setLocalDescriptionSuccess(remotePeerConnection);
            }).catch(setSessionDescriptionError);

        trace('localPeerConnection setRemoteDescription start.');
        localPeerConnection.setRemoteDescription(description)
            .then(() => {
                setRemoteDescriptionSuccess(localPeerConnection);
            }).catch(setSessionDescriptionError);
    }




    ////////////////////////////////////////////////////////////////////////////
    //  Define RTC peer connection - for log


    // Logs that the connection succeeded.
    function handleConnectionSuccess(peerConnection) {
        trace(`${getPeerName(peerConnection)} addIceCandidate success.`);
    };

    // Logs that the connection failed.
    function handleConnectionFailure(peerConnection, error) {
        trace(`${getPeerName(peerConnection)} failed to add ICE Candidate:\n` +
            `${error.toString()}.`);
    }

    // Logs success when setting session description.
    function setDescriptionSuccess(peerConnection, functionName) {
        const peerName = getPeerName(peerConnection);
        trace(`${peerName} ${functionName} complete.`);
    }

    // Logs success when localDescription is set.
    function setLocalDescriptionSuccess(peerConnection) {
        setDescriptionSuccess(peerConnection, 'setLocalDescription');
    }

    // Logs error when setting session description fails.
    function setSessionDescriptionError(error) {
        trace(`Failed to create session description: ${error.toString()}.`);
    }







    ////////////////////////////////////////////////////////////////////////////
    //  Define RTC peer disconnect

    function hangupAction() {
        localPeerConnection.close();
        remotePeerConnection.close();
        localPeerConnection = null;
        remotePeerConnection = null;

        $hangupButton.prop("disabled", true);
        $callButton.prop("disabled", false);

        trace('Ending call.');
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
