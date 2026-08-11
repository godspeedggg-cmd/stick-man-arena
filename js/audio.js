/* ============================================================
 * Stickman: Warrior's Legacy
 * audio.js — procedural WebAudio sound effects + generative music
 * ============================================================ */
(function (SL) {
  "use strict";

  class AudioSystem {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.sfxGain = null;
      this.musicGain = null;
      this.enabled = true;
      this.sfxVol = 0.85;
      this.musicVol = 0.4;
      this.musicOn = true;
      this.noiseBuf = null;
      this.initialized = false;
      this.musicTimer = null;
      this.bar = 0;
    }

    init() {
      if (this.initialized) { this.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this.enabled = false; return; }
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxVol;
      this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicVol;
      this.musicGain.connect(this.master);
      // white noise buffer
      const len = this.ctx.sampleRate * 1;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.initialized = true;
    }

    resume() {
      if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
    }

    setVolumes(sfx, music, musicOn) {
      this.sfxVol = sfx;
      this.musicVol = music;
      this.musicOn = musicOn;
      if (this.sfxGain) this.sfxGain.gain.value = sfx;
      if (this.musicGain) this.musicGain.gain.value = musicOn ? music : 0;
    }

    _t(freq, dur, type, gain, when, slideTo) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type || "square";
      o.frequency.setValueAtTime(freq, when);
      if (slideTo !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), when + dur);
      g.gain.setValueAtTime(gain, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + dur);
      o.connect(g); g.connect(this.sfxGain);
      o.start(when); o.stop(when + dur + 0.02);
    }

    _noise(dur, gain, when, filterFreq, q, type) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = type || "lowpass";
      f.frequency.value = filterFreq;
      if (q !== undefined) f.Q.value = q;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(gain, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + dur);
      src.connect(f); f.connect(g); g.connect(this.sfxGain);
      src.start(when); src.stop(when + dur + 0.02);
    }

    play(name, opts) {
      if (!this.enabled || !this.ctx || !this.sfxGain) return;
      if (this.ctx.state === "suspended") this.resume();
      opts = opts || {};
      const when = this.ctx.currentTime + (opts.delay || 0);
      const det = (opts.detune !== undefined ? opts.detune : 0);
      const f = (base) => base * Math.pow(2, det / 1200);
      switch (name) {
        case "click":
          this._t(f(660), 0.06, "triangle", 0.18, when, f(880));
          break;
        case "slash":
          this._noise(0.1, 0.22, when, 1800, 2, "bandpass");
          this._t(f(300), 0.09, "sawtooth", 0.06, when, f(120));
          break;
        case "heavy":
          this._noise(0.16, 0.34, when, 1000, 1.5, "bandpass");
          this._t(f(180), 0.18, "sawtooth", 0.2, when, f(60));
          break;
        case "hit":
          this._noise(0.08, 0.28, when, 900, 1);
          this._t(f(220), 0.08, "square", 0.12, when, f(110));
          break;
        case "crit":
          this._noise(0.12, 0.4, when, 2400, 1.2);
          this._t(f(520), 0.12, "sawtooth", 0.2, when, f(180));
          this._t(f(780), 0.1, "square", 0.1, when + 0.02, f(300));
          break;
        case "enemyHit":
          this._noise(0.07, 0.2, when, 700, 1);
          this._t(f(160), 0.07, "triangle", 0.14, when, f(90));
          break;
        case "hurt":
          this._t(f(220), 0.22, "sawtooth", 0.26, when, f(70));
          this._noise(0.15, 0.2, when, 500);
          break;
        case "death":
          this._t(f(300), 0.6, "sawtooth", 0.3, when, f(40));
          this._t(f(150), 0.8, "triangle", 0.26, when + 0.1, f(30));
          this._noise(0.6, 0.24, when, 400);
          break;
        case "jump":
          this._t(f(300), 0.14, "triangle", 0.12, when, f(560));
          break;
        case "land":
          this._noise(0.06, 0.12, when, 500);
          break;
        case "dash":
          this._noise(0.16, 0.22, when, 2600, 1.5, "bandpass");
          this._t(f(200), 0.16, "sine", 0.14, when, f(600));
          break;
        case "shoot":
          this._t(f(880), 0.08, "square", 0.12, when, f(440));
          break;
        case "fire":
          this._noise(0.2, 0.18, when, 800);
          this._t(f(240), 0.18, "sawtooth", 0.08, when, f(120));
          break;
        case "lightning":
          this._noise(0.18, 0.34, when, 4200, 1, "highpass");
          this._t(f(1200), 0.14, "sawtooth", 0.12, when, f(200));
          break;
        case "explosion":
          this._noise(0.5, 0.4, when, 700, 0.8);
          this._t(f(140), 0.5, "sine", 0.3, when, f(40));
          break;
        case "coin":
          this._t(f(880), 0.07, "sine", 0.16, when);
          this._t(f(1320), 0.12, "sine", 0.16, when + 0.07);
          break;
        case "gem":
          this._t(f(1040), 0.09, "sine", 0.18, when);
          this._t(f(1560), 0.09, "sine", 0.18, when + 0.08);
          this._t(f(2080), 0.2, "sine", 0.18, when + 0.16);
          break;
        case "levelup":
          [523, 659, 784, 1046].forEach((n, i) => this._t(f(n), 0.18, "triangle", 0.2, when + i * 0.09));
          break;
        case "upgrade":
          this._t(f(660), 0.1, "triangle", 0.2, when);
          this._t(f(880), 0.16, "triangle", 0.2, when + 0.09);
          break;
        case "bossWarn":
          this._t(f(98), 0.7, "sawtooth", 0.4, when);
          this._t(f(98), 0.7, "sawtooth", 0.4, when + 0.15);
          this._t(f(147), 0.9, "sawtooth", 0.3, when + 0.35);
          break;
        case "bossDefeat":
          [392, 494, 587, 784, 988].forEach((n, i) => this._t(f(n), 0.24, "triangle", 0.24, when + i * 0.12));
          this._noise(0.6, 0.3, when + 0.4, 900);
          break;
        case "heal":
          this._t(f(440), 0.12, "sine", 0.16, when);
          this._t(f(660), 0.16, "sine", 0.16, when + 0.1);
          break;
        case "shield":
          this._t(f(320), 0.2, "sine", 0.18, when, f(180));
          this._noise(0.15, 0.14, when, 2000);
          break;
        case "combo":
          this._t(f(600 + Math.min(1200, (opts.combo || 0) * 12)), 0.08, "square", 0.1, when);
          break;
        case "synergy":
          [659, 784, 988, 1318].forEach((n, i) => this._t(f(n), 0.2, "square", 0.14, when + i * 0.08));
          break;
        case "enemyWarn":
          this._t(f(1400), 0.09, "square", 0.08, when, f(900));
          break;
        case "ult":
          this._noise(0.5, 0.35, when, 3000, 1, "bandpass");
          this._t(f(80), 0.6, "sawtooth", 0.3, when, f(30));
          break;
        default: break;
      }
    }

    /* ---------- generative background music ---------- */
    startMusic() {
      if (!this.ctx || this.musicTimer) return;
      this.stopMusic();
      this.bar = 0;
      const step = 0.24; // 8th notes
      const schedule = () => {
        if (!this.ctx || !this.musicGain) return;
        const when = this.ctx.currentTime + 0.05;
        const scales = [
          [110, 131, 147, 165, 196, 220, 262], // A minor-ish
          [98, 110, 131, 147, 165, 196, 220],
          [87, 110, 117, 131, 147, 165, 175],
        ];
        const sc = scales[this.bar % scales.length];
        const bass = sc[0];
        // bass line
        for (let i = 0; i < 8; i++) {
          if (i % 4 === 0 || i === 3) {
            this._musicNote(bass * (i % 4 === 3 ? 1.5 : 1), 0.5, 0.32, when + i * step, "sawtooth");
          }
        }
        // melody
        const seq = [2, 0, 3, 1, 4, 2, 5, 3];
        for (let i = 0; i < 8; i++) {
          if (Math.random() < 0.75) {
            const n = sc[seq[(this.bar + i) % seq.length]] * 2;
            this._musicNote(n, 0.45, 0.10, when + i * step, "triangle");
          }
        }
        // hat
        for (let i = 0; i < 8; i++) {
          if (i % 2 === 1) this._musicNoise(0.03, 0.05, when + i * step, 6000, "highpass");
        }
        this.bar++;
      };
      schedule();
      this.musicTimer = setInterval(schedule, step * 8 * 1000 - 80);
    }

    stopMusic() {
      if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
    }

    _musicNote(freq, dur, gain, when, type) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(gain, when + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, when + dur);
      o.connect(g); g.connect(this.musicGain);
      o.start(when); o.stop(when + dur + 0.05);
    }

    _musicNoise(dur, gain, when, filterFreq, type) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = this.ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = filterFreq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(gain, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + dur);
      src.connect(f); f.connect(g); g.connect(this.musicGain);
      src.start(when); src.stop(when + dur + 0.02);
    }

    toggleMute() {
      this.enabled = !this.enabled;
      if (this.master) this.master.gain.value = this.enabled ? 1 : 0;
      return this.enabled;
    }
  }

  SL.Audio = new AudioSystem();

})(window.SL = window.SL || {});
