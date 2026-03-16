export class SoundSynth {
  constructor() {
    this._ctx = null;
  }

  _getCtx() {
    if (!this._ctx) {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this._ctx.state === 'suspended') {
      this._ctx.resume();
    }
    return this._ctx;
  }

  _playTone({ type = 'square', freq = 440, endFreq = null, duration = 0.04, gain = 0.15, delay = 0 } = {}) {
    try {
      const ctx = this._getCtx();
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.type = type;
      const startTime = ctx.currentTime + delay;
      osc.frequency.setValueAtTime(freq, startTime);
      if (endFreq !== null) {
        osc.frequency.linearRampToValueAtTime(endFreq, startTime + duration);
      }

      gainNode.gain.setValueAtTime(gain, startTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      osc.start(startTime);
      osc.stop(startTime + duration + 0.01);
    } catch (e) {
      // Audio unavailable, silently ignore
    }
  }

  _playNoise({ duration = 0.05, gain = 0.1, delay = 0 } = {}) {
    try {
      const ctx = this._getCtx();
      const bufferSize = ctx.sampleRate * duration;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(gain, ctx.currentTime + delay);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);

      source.connect(gainNode);
      gainNode.connect(ctx.destination);
      source.start(ctx.currentTime + delay);
    } catch (e) {
      // Silence
    }
  }

  click() {
    this._playTone({ type: 'square', freq: 880, duration: 0.04, gain: 0.12 });
  }

  menuSelect() {
    this._playTone({ type: 'square', freq: 220, duration: 0.02, gain: 0.08 });
  }

  beepHigh() {
    this._playTone({ type: 'square', freq: 440, duration: 0.05, gain: 0.15 });
    this._playTone({ type: 'square', freq: 880, duration: 0.05, gain: 0.15, delay: 0.06 });
  }

  beepLow() {
    this._playTone({ type: 'square', freq: 880, duration: 0.05, gain: 0.15 });
    this._playTone({ type: 'square', freq: 220, duration: 0.08, gain: 0.15, delay: 0.06 });
  }

  eliminate() {
    this._playNoise({ duration: 0.08, gain: 0.2 });
    this._playTone({ type: 'sawtooth', freq: 80, duration: 0.15, gain: 0.2, delay: 0.05 });
  }

  proofTick() {
    this._playTone({ type: 'square', freq: 600, duration: 0.02, gain: 0.08 });
  }

  proofSuccess() {
    // C major arpeggio: C4 E4 G4 C5 E5
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25];
    notes.forEach((freq, i) => {
      this._playTone({ type: 'square', freq, duration: 0.12, gain: 0.15, delay: i * 0.1 });
    });
  }

  proofFail() {
    this._playTone({ type: 'sawtooth', freq: 440, endFreq: 55, duration: 0.6, gain: 0.2 });
  }

  bootBeep() {
    this._playTone({ type: 'sine', freq: 320, duration: 0.04, gain: 0.04 });
  }

  accessDenied() {
    this._playTone({ type: 'sawtooth', freq: 200, endFreq: 100, duration: 0.3, gain: 0.2 });
  }

  countdownBeep(secondsLeft) {
    // Higher pitch / double beep for last 5 seconds
    if (secondsLeft <= 5) {
      this._playTone({ type: 'square', freq: 1200, duration: 0.06, gain: 0.18 });
      this._playTone({ type: 'square', freq: 1200, duration: 0.06, gain: 0.18, delay: 0.1 });
    } else {
      this._playTone({ type: 'square', freq: 800, duration: 0.05, gain: 0.14 });
    }
  }
}
