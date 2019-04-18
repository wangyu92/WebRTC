'use strict';

class PeerConnectionController {

    /**
     * [constructor description]
     * 생성자
     */
    constructor() {
        this._peerConnection = null;
    }

    // maybeStart() {
    //     console.log('>>>>>>> maybeStart() ', signalingClient._started, localStream, signalingClient._channelReady);
    //     if (!signalingClient._started && typeof localStream !== 'undefined' && signalingClient._channelReady) {
    //         console.log('>>>>>> creating peer connection');
    //         createPeerConnection();
    //         pc.addStream(localStream);
    //         signalingClient._started = true;
    //         console.log('isInitiator', signalingClient._initiator);
    //         if (signalingClient._initiator) {
    //             callButton.disabled = false;
    //         }
    //     }
    // }

    createConnection(iceServers) {
        try {
            this._peerConnection = new RTCPeerConnection(iceServers);
            this._peerConnection.onicecandidate = handleIceCandidate;
            this._peerConnection.onaddstream = handleRemoteStreamAdded;
            this._peerConnection.onremovestream = handleRemoteStreamRemoved;
            console.log('Created RTCPeerConnnection');
        } catch (e) {
            console.log('Failed to create PeerConnection, exception: ' + e.message);
            window.alert('Cannot create RTCPeerConnection object.');
            return;
        }

        function handleIceCandidate(event) {
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
        }

        function handleRemoteStreamAdded(event) {
            console.log('Remote stream added.');
            remoteStream = event.stream;
            remoteVideo.srcObject = remoteStream;
        }

        function handleRemoteStreamRemoved(event) {
            console.log('Remote stream removed. Event: ', event);
        }
    }
}
