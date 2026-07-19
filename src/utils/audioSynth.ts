// Sanzo Music - Web Audio API Synthesizer Engine
// Programmatically synthesizes electronic background streams matching the selected style, BPM, and chords.

export class AudioSynth {
  private ctx: AudioContext | null = null;
  private masterCompressor: DynamicsCompressorNode | null = null;
  private masterGain: GainNode | null = null;
  private timerId: number | null = null;
  private isRunning: boolean = false;
  private bpm: number;
  private style: string;
  private chords: string;
  private currentStep: number = 0;
  private nextNoteTime: number = 0.0;
  private scheduleAheadTime: number = 0.1; // How far ahead to schedule audio (seconds)
  private lookahead: number = 25.0; // How frequently to call scheduling function (milliseconds)
  private rainNode: AudioNode | null = null;

  constructor(style: string, bpm: number, chords?: string) {
    this.style = style.toLowerCase();
    this.bpm = bpm || 120;
    this.chords = chords || 'Auto';
  }

  // Connect helper to prevent clipping & handle routing
  private connectToMaster(node: AudioNode) {
    if (this.masterCompressor) {
      node.connect(this.masterCompressor);
    } else if (this.ctx) {
      node.connect(this.ctx.destination);
    }
  }

  // Create lowpass-filtered white noise buffer for rain/dust effects
  private createRainNoise(ctx: AudioContext): AudioNode {
    const bufferSize = 2 * ctx.sampleRate;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, ctx.currentTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.012, ctx.currentTime); // very quiet ambient sound

    whiteNoise.connect(filter);
    filter.connect(gain);
    this.connectToMaster(gain);

    whiteNoise.start();
    return whiteNoise;
  }

  // Schedule next notes at precise Web Audio timestamp
  private scheduleNote(step: number, time: number) {
    if (!this.ctx) return;

    const isAmbient = this.style.includes('ambient') || this.style.includes('zen') || this.style.includes('chill') || this.style.includes('静') || this.style.includes('空') || this.style.includes('rain');
    const isSynthwave = this.style.includes('synth') || this.style.includes('wave') || this.style.includes('retro') || this.style.includes('cyber') || this.style.includes('霓虹') || this.style.includes('赛博');
    const isChaos = this.style.includes('chaos') || this.style.includes('glitch') || this.style.includes('idm') || this.style.includes('break') || this.style.includes('noise') || this.style.includes('混沌');

    // Root frequency helper from chords
    let rootFreq = 220.0; // A3
    if (this.chords.includes('Minor') || this.style.includes('dark') || this.style.includes('void')) {
      rootFreq = 196.0; // G3 / Minor vibe
    } else if (this.chords.includes('Major')) {
      rootFreq = 261.63; // C4 / Major vibe
    }

    if (isAmbient) {
      // Ambient Pad: long attack slow release drone
      // Play base chords at step 0 and 4 (in 8-step cycle)
      if (step === 0 || step === 4) {
        this.playPad(rootFreq, time, 4.0);
        this.playPad(rootFreq * 1.5, time, 4.0); // Perfect fifth
        if (step === 0) {
          this.playPad(rootFreq * 0.5, time, 4.0); // Sub bass octave
        }
      }

      // Random quiet chime pluck (18% probability)
      if (Math.random() < 0.18) {
        // Pentatonic choices
        const scaleMultipliers = [1, 1.125, 1.25, 1.5, 1.667, 2, 2.25];
        const mult = scaleMultipliers[Math.floor(Math.random() * scaleMultipliers.length)];
        this.playPluck(rootFreq * 2 * mult, time, 'sine', 0.05, 0.8);
      }
    } else if (isSynthwave) {
      // 8th note driving bassline (Synthwave theme)
      // schedule two bass plucks per step (step is quarter notes, so bass plays on subdivisions too)
      const bassOctave = step % 2 === 0 ? 0.25 : 0.5;
      this.playSynthwaveBass(rootFreq * bassOctave, time, 0.2);
      this.playSynthwaveBass(rootFreq * bassOctave, time + 60 / this.bpm / 2, 0.2);

      // Play Arpeggio on square wave (step 0, 2, 4, 6)
      if (step % 2 === 0) {
        const arpNotes = [1, 1.2, 1.5, 1.8]; // Minor arpeggio
        const noteIdx = (step / 2) % arpNotes.length;
        this.playPluck(rootFreq * 2 * arpNotes[noteIdx], time, 'square', 0.02, 0.25);
      }
    } else if (isChaos) {
      // Glitch bleeps & FM modulation
      if (Math.random() < 0.5) {
        const glitchFreq = 300 + Math.random() * 1200;
        const dur = 0.02 + Math.random() * 0.08;
        this.playGlitchBleep(glitchFreq, time, dur);
      }
      
      // Random noisy static click
      if (Math.random() < 0.3) {
        this.playNoisePerc(time);
      }
    } else {
      // Default: Simple clean arpeggio loop
      if (step % 2 === 0) {
        this.playPluck(rootFreq, time, 'triangle', 0.05, 0.4);
      } else {
        this.playPluck(rootFreq * 1.5, time, 'sine', 0.05, 0.3);
      }
    }
  }

  // --- Sound Generative Sub-systems ---

  private playPad(freq: number, startTime: number, duration: number) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(0, startTime);
    // Slow Attack
    gain.gain.linearRampToValueAtTime(0.08, startTime + 1.2);
    // Sustain
    gain.gain.setValueAtTime(0.08, startTime + duration - 1.0);
    // Slow Release
    gain.gain.linearRampToValueAtTime(0, startTime + duration);

    osc.connect(gain);
    this.connectToMaster(gain);

    osc.start(startTime);
    osc.stop(startTime + duration);
  }

  private playPluck(freq: number, startTime: number, type: OscillatorType, attack: number, decay: number) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.06, startTime + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + attack + decay);

    osc.connect(gain);
    this.connectToMaster(gain);

    osc.start(startTime);
    osc.stop(startTime + attack + decay + 0.1);
  }

  private playSynthwaveBass(freq: number, startTime: number, duration: number) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const lowpass = this.ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, startTime);

    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(250, startTime);
    lowpass.frequency.exponentialRampToValueAtTime(80, startTime + duration);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.18, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(lowpass);
    lowpass.connect(gain);
    this.connectToMaster(gain);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
  }

  private playGlitchBleep(freq: number, startTime: number, duration: number) {
    if (!this.ctx) return;
    const carrier = this.ctx.createOscillator();
    const modulator = this.ctx.createOscillator();
    const modGain = this.ctx.createGain();
    const mainGain = this.ctx.createGain();

    carrier.type = 'sine';
    carrier.frequency.setValueAtTime(freq, startTime);

    modulator.type = 'sine';
    modulator.frequency.setValueAtTime(freq * (Math.random() > 0.5 ? 2.5 : 0.5), startTime);

    modGain.gain.setValueAtTime(Math.random() * 500, startTime);

    mainGain.gain.setValueAtTime(0, startTime);
    mainGain.gain.linearRampToValueAtTime(0.05, startTime + 0.002);
    mainGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    modulator.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(mainGain);
    this.connectToMaster(mainGain);

    modulator.start(startTime);
    carrier.start(startTime);

    modulator.stop(startTime + duration + 0.05);
    carrier.stop(startTime + duration + 0.05);
  }

  private playNoisePerc(startTime: number) {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 0.03; // Short click 30ms
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(5000, startTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.03, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.025);

    whiteNoise.connect(filter);
    filter.connect(gain);
    this.connectToMaster(gain);

    whiteNoise.start(startTime);
    whiteNoise.stop(startTime + 0.03);
  }

  private scheduler() {
    if (!this.ctx) return;
    // Schedule all notes until nextLookahead window
    while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
      this.scheduleNote(this.currentStep, this.nextNoteTime);
      this.advanceNote();
    }
  }

  private advanceNote() {
    // 8-step cycle (e.g. 2 bars in 4/4)
    const secondsPerBeat = 60.0 / this.bpm;
    this.nextNoteTime += secondsPerBeat;
    this.currentStep = (this.currentStep + 1) % 8;
  }

  public async play() {
    if (this.isRunning) return;
    
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (e) {
      console.warn("Web Audio API is not supported in this environment.", e);
      return;
    }

    // Ensure AudioContext is active (Autoplay Policy compliance)
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch (resumeErr) {
        console.warn("AudioContext resume failed:", resumeErr);
      }
    }

    // Setup master compressor and gain node to prevent clipping
    try {
      this.masterCompressor = this.ctx.createDynamicsCompressor();
      this.masterCompressor.threshold.setValueAtTime(-20, this.ctx.currentTime);
      this.masterCompressor.knee.setValueAtTime(30, this.ctx.currentTime);
      this.masterCompressor.ratio.setValueAtTime(12, this.ctx.currentTime);
      this.masterCompressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
      this.masterCompressor.release.setValueAtTime(0.25, this.ctx.currentTime);

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.85, this.ctx.currentTime);

      this.masterCompressor.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
    } catch (routeErr) {
      console.warn("Failed to set up master audio routing, falling back to direct routing:", routeErr);
      this.masterCompressor = null;
      this.masterGain = null;
    }

    this.isRunning = true;
    this.currentStep = 0;
    this.nextNoteTime = this.ctx.currentTime;

    // Start background atmospheric noise (for ambient & rain styles)
    const isAmbient = this.style.includes('ambient') || this.style.includes('zen') || this.style.includes('chill') || this.style.includes('静') || this.style.includes('空') || this.style.includes('rain');
    if (isAmbient && this.ctx) {
      this.rainNode = this.createRainNoise(this.ctx);
    }

    // Schedule loop
    const runScheduler = () => {
      if (!this.isRunning) return;
      this.scheduler();
      this.timerId = window.setTimeout(runScheduler, this.lookahead);
    };

    runScheduler();
  }

  public stop() {
    this.isRunning = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    if (this.rainNode) {
      try {
        (this.rainNode as any).stop();
      } catch (e) {}
      this.rainNode = null;
    }
    this.masterCompressor = null;
    this.masterGain = null;
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
  }
}
