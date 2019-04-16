'use strict';

/**
 * 시그널링에 관련한 프로세스는 다 이 클래스에서 처리.
 * 예를 들어서 main.js에서 해당 클래스의 인스턴스를 생성하여 시그널링 프로세스를 처리.
 */
class SignalingClient {

    /**
     * [constructor description]
     * ICE Server를 지정하여 클래스의 인스턴스를 생성.
     * @param {[type]} iceServers [description]
     */
    constructor(iceServers) {
        this._server = "https://ms.hanyang.ac.kr:8800";
        this._iceServer = iceServers;
        this._socket = io(this._server);
        this._initiator = false;
        this._channelReady = false;

        this.addEventListenerOfSocekt();
    }

    /**
     * [joinRoom description]
     * 방에 참여하기위한 함수. 만약 생성된 방이 서버에 없을 경우, 방이 새로 생성된다.
     * @param  {[type]} name 방 이름
     * @return {[type]}      [description]
     */
    joinRoom(name) {
        this._roomName = name;
        this._socket.emit('create or join', this._roomName);
    }

    /**
     * [checkICEServer description]
     * ICE 서버가 정상적으로 동작하는지 체크하는 함수.
     * @param  {[type]} timeout [description]
     * @return {[type]}         [description]
     */
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

    /**
     * [addEventListenerOfSocekt description]
     * 리스너를 붙여주는 함수. 객체 생성 후 서버와 연결이 되고나면 반드시 실행해준다.
     */
    addEventListenerOfSocekt() {
        //  방 생성자가 방 생성에 성공하면 수신
        this._socket.on('created', function(room) {
            this._initiator = true;
        });

        //  방 생성자가 아닌 사람이 join하면 수신
        this._socket.on('joined', function(room) {
            console.log('joined: ' + room);
            this._channelReady = true;
        });

        //  다른 피어가 접속하면 수신
        this._socket.on('join', function(room) {
            console.log('Another peer made a request to join room ' + room);
            console.log('This peer is the initiator of room ' + room + '!');
            this._channelReady = true;
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
