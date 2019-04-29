'use strict';

class PeerConnectionController {

    /**
     * [constructor description]
     * 생성자
     */
    constructor() {
        this._peerConnection = null;

        /**
         * 이벤트가 발생했을 때 delgate 하기위한 함수를 보관하는 Map
         * @type {Map}
         */
        this._eventMap = new Map();
    }

    /**
     * [setEventListener description]
     * 이벤트맵에 받아볼 이벤트를 등록하는 함수.
     * @param {[type]} event [description]
     * @param {[type]} func  [description]
     */
    setEventListener(eventName, func) {
        this._eventMap.set(eventName, func);
    }

    createConnection(iceServers) {
        const self = this;

        try {
            this._peerConnection = new RTCPeerConnection(iceServers);
            this._peerConnection.onicecandidate = handleIceCandidate;
            this._peerConnection.onaddstream = handleRemoteStreamAdded;
            this._peerConnection.onremovestream = handleRemoteStreamRemoved;

            let func = this._eventMap.get('peer connection created');
            if(func !== 'undefined') {
                func();
            }
        } catch (e) {
            console.log('Failed to create PeerConnection, exception: ' + e.message);
            window.alert('Cannot create RTCPeerConnection object.');

            let func = this._eventMap.get('peer connection failed');
            if(func !== 'undefined') {
                func(e);
            }
            return;
        }

        function handleIceCandidate(event) {
            let func = self._eventMap.get('handleIceCandidate');
            if(func !== 'undefined') {
                func(event);
            }
        }

        function handleRemoteStreamAdded(event) {
            let func = self._eventMap.get('handleRemoteStreamAdded');
            if(func !== 'undefined') {
                func(event);
            }
        }

        function handleRemoteStreamRemoved(event) {
            let func = self._eventMap.get('handleRemoteStreamAdded');
            if(func !== 'undefined') {
                func(event);
            }
        }
    }

    addStream(stream) {
        this._peerConnection.addStream(stream);
    }

    call() {
        const self = this;

        this._peerConnection.createOffer(setLocalAndSendMessage, handleCreateOfferError);

        function setLocalAndSendMessage(sessionDescription) {
            self._peerConnection.setLocalDescription(sessionDescription);

            let func = self._eventMap.get('setLocalAndSendMessage');
            if(func !== 'undefined') {
                func(sessionDescription);
            }
        }

        function handleCreateOfferError(event) {
            let func = self._eventMap.get('handleCreateOfferError');
            if(func !== 'undefined') {
                func(event);
            }
        }
    }

    answer() {
        const self = this;

        this._peerConnection.createAnswer().then(
            setLocalAndSendMessage,
            onCreateSessionDescriptionError
        );

        function setLocalAndSendMessage(sessionDescription) {
            self._peerConnection.setLocalDescription(sessionDescription);

            let func = self._eventMap.get('setLocalAndSendMessage');
            if(func !== 'undefined') {
                func(sessionDescription);
            }
        }

        function onCreateSessionDescriptionError(error) {
            let func = self._eventMap.get('onCreateSessionDescriptionError');
            if(func !== 'undefined') {
                func(error);
            }

        }
    }

    setRemoteDescription(message) {
        this._peerConnection.setRemoteDescription(message);
    }

    addIceCandidate(message) {
        var candidate = new RTCIceCandidate({
            sdpMLineIndex: message.label,
            candidate: message.candidate
        });
        this._peerConnection.addIceCandidate(candidate);
    }

    close() {
        this._peerConnection.close();
    }
}
