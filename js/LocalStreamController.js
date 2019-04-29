'use strict';

class LocalStreamController {

    /**
     * 생성자
     */
    constructor(constraints) {
        this._constraints = constraints;
    }

    /**
     * 미디어 스트림을 가져옴
     * @return {[type]} 미디어 스트림을 가져오는 Promise를 리턴
     */
    getLocalMediaStream() {
        return navigator.mediaDevices.getUserMedia(this._constraints);
    }
}
