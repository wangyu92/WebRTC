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
    constructor(signalingServer, iceServers) {
        this._server = signalingServer;
        this._iceServer = iceServers;
        this._socket = io(this._server);

        /**
         * 방 생성자가 방을 생성하면 True가 됨.
         *
         * @type {Boolean}
         */
        this._initiator = false;

        /**
         * 상대방이 접속하면 True가 됨.
         *
         * @type {Boolean}
         */
        this._channelReady = false;

        /**
         * 통신이 시작되면 True가 됨.
         * @type {Boolean}
         */
        this._started = false;

        /**
         * 이벤트가 발생했을 때 delgate 하기위한 함수를 보관하는 Map
         * @type {Map}
         */
        this._eventMap = new Map();

        this.addEventListenerOfSocekt();
    }

    /**
     * 방을 생성한 클라이언트인지 아닌지
     * @return {Boolean} [description]
     */
    isInitiator() {
        return this._initiator;
    }

    /**
     * 상대가 접속하여 서로 통신할 준비가 되었는지. 즉, 같은 방에 두명 이상이 있는지.
     * @return {Boolean} [description]
     */
    isChannelReady() {
        return this._channelReady;
    }

    /**
     * 서로 통신하고 있는지
     * @return {Boolean} [description]
     */
    isStarted() {
        return this._started;
    }

    setStarted(bool) {
        this._started = bool;
    }

    /**
     * [sendMessage description]
     * 서버로 메시지를 보냄.
     * @param  {[type]} message [description]
     * @return {[type]}         [description]
     */
    sendMessage(message) {
        let obj = new Object({});
        obj.room = this._roomName;
        obj.msg = message;
        this._socket.emit('message', JSON.stringify(obj));
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
        const self = this;

        //  방 생성자가 방 생성에 성공하면 수신
        this._socket.on('created', function(room) {
            self._initiator = true;

            //  event delegation을 위함.
            let func = self._eventMap.get('created');
            if(func !== 'undefined') {
                func(room);
            }
        });

        //  방 생성자가 아닌 사람이 join하면 수신
        this._socket.on('joined', function(room) {
            self._channelReady = true;

            //  event delegation을 위함
            let func = self._eventMap.get('joined');
            if(func !== 'undefined') {
                func(room);
            }
        });

        //  다른 피어가 접속하면 수신
        this._socket.on('join', function(room) {
            self._channelReady = true;

            //  event delegation을 위함
            let func = self._eventMap.get('join');
            if(func !== 'undefined') {
                func(room);
            }
        });


        // This client receives a message
        this._socket.on('message', function(message) {
            //  event delegation을 위함
            let func = self._eventMap.get('message');
            if(func !== 'undefined') {
                func(message);
            }
        });

        this._socket.io.on('connect_error', function(err) {
            //  event delegation을 위함
            let func = self._eventMap.get('connect_error');
            if(func !== 'undefined') {
                func(err);
            }
        });

        this._socket.on('full', function(room) {
            console.log('Room ' + room + ' is full');
        });

        this._socket.on('log', function(array) {
            console.log.apply(console, array);
        });
    }

    close() {
        this._socket.close();
        this._initiator = false;
        this._channelReady = false;
        this._started = false;
    }
}
