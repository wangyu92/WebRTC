'use strict';

class SignalingClient {
    constructor(iceServers) {
        this._server = "https://ms.hanyang.ac.kr:8800";
        this._iceServer = iceServers;
        this._socket = io(this._server);

        this.addEventListenerOfSocekt();
    }

    createRoom(name) {
        this._roomName = name;
        this._socket.emit('create or join', this._roomName);
    }

    checkICEServer(timeout) {
        return new Promise(function(resolve, reject) {

            setTimeout(function() {
                if (promiseResolved) return;
                resolve(false);
                promiseResolved = true;
            }, timeout || 3000);

            var promiseResolved = false,
                pc = new RTCPeerConnection(iceServers),
                noop = function() {};
            pc.createDataChannel(""); //create a bogus data channel
            pc.createOffer(function(sdp) {
                if (sdp.sdp.indexOf('typ relay') > -1) { // sometimes sdp contains the ice candidates...
                    promiseResolved = true;
                    resolve(true);
                }
                pc.setLocalDescription(sdp, noop, noop);
            }, noop); // create offer and set local description
            pc.onicecandidate = function(ice) { //listen for candidate events
                if (promiseResolved || !ice || !ice.candidate || !ice.candidate.candidate || !(ice.candidate.candidate.indexOf('typ relay') > -1)) return;
                promiseResolved = true;
                resolve(true);
            };
        });
    }

    addEventListenerOfSocekt() {
        //  방 생성자가 방 생성에 성공하면 수신
        this._socket.on('created', function(room) {
            isInitiator = true;
        });

        //  방 생성자가 아닌 사람이 join하면 수신
        this._socket.on('joined', function(room) {
            console.log('joined: ' + room);
            isChannelReady = true;
        });

        //  다른 피어가 접속하면 수신
        this._socket.on('join', function(room) {
            console.log('Another peer made a request to join room ' + room);
            console.log('This peer is the initiator of room ' + room + '!');
            isChannelReady = true;
        });


        // This client receives a message
        this._socket.on('message', function(message) {
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

        this._socket.io.on('connect_error', function(err) {
            // alert("Signaling 서버가 동작하지 않습니다.");
            getStreamButton.disabled = true;
            hangupButton.disabled = true;
        });

        this._socket.on('full', function(room) {
            console.log('Room ' + room + ' is full');
        });

        this._socket.on('log', function(array) {
            console.log.apply(console, array);
        });
    }
}

checkTURNServer({
    url: 'turn:ms.hanyang.ac.kr:88011',
    username: 'wangyu',
    credential: 'doqemddl'
}).then(function(bool) {
    console.log('is TURN server active? ', bool ? 'yes' : 'no');
    if (!bool) {
        window.alert('TURN 서버로부터 응답이 없습니다. NAT 환경에서는 동작하지 않을 수 있습니다.');
    }
}).catch(console.error.bind(console));
