// Installed as window.YT before the app loads during e2e runs, in place of the YouTube IFrame API.
// Implements the slice of YT.Player that react-youtube and the app use, and exposes window.__yt so
// tests can drive playback deterministically.
/* eslint-disable @typescript-eslint/no-this-alias -- ES5 constructor; handlers close over the instance */
;(function () {
    var ENDED = 0
    var PLAYING = 1
    var PAUSED = 2
    var players = []

    function Player(el, options) {
        var node = typeof el === 'string' ? document.getElementById(el) : el
        var self = this
        var events = options.events || {}
        node.setAttribute('data-fake-player', options.videoId)
        this.videoId = options.videoId
        this.state = -1
        this.time = 0
        this.duration = window.__ytDuration || 600
        this.emit = function (name, data) {
            if (events[name]) events[name]({ target: self, data: data })
        }
        this.setState = function (state) {
            self.state = state
            self.emit('onStateChange', state)
        }
        this.playVideo = function () { self.setState(PLAYING) }
        this.pauseVideo = function () { self.setState(PAUSED) }
        this.stopVideo = function () { self.state = -1 }
        this.seekTo = function (t) { self.time = t }
        this.getCurrentTime = function () { return self.time }
        this.getDuration = function () { return self.duration }
        this.getPlayerState = function () { return self.state }
        this.getIframe = function () { return node }
        this.destroy = function () {
            var i = players.indexOf(self)
            if (i >= 0) players.splice(i, 1)
        }
        this.loadVideoById = function () {}
        this.cueVideoById = function () {}
        players.push(this)
        setTimeout(function () {
            self.emit('onReady')
            var vars = options.playerVars || {}
            if (vars.autoplay) self.playVideo()
        }, 0)
    }

    window.__yt = {
        current: function () { return players[players.length - 1] },
        videoId: function () { var p = players[players.length - 1]; return p ? p.videoId : null },
        play: function (atSec) {
            var p = players[players.length - 1]
            if (typeof atSec === 'number') p.time = atSec
            p.setState(PLAYING)
        },
        end: function () {
            var p = players[players.length - 1]
            p.time = p.duration
            p.setState(ENDED)
        },
    }

    window.YT = { Player: Player, PlayerState: { UNSTARTED: -1, ENDED: ENDED, PLAYING: PLAYING, PAUSED: PAUSED, BUFFERING: 3, CUED: 5 } }
    if (typeof window.onYouTubeIframeAPIReady === 'function') window.onYouTubeIframeAPIReady()
})()
