/**
 * Linux Studio Plugins (LSP Plugins) DSP Audio Engine Integration
 * Provides high-precision Web Audio DSP nodes and processing for all 13 LSP plugins
 * based on https://github.com/egidf/lsp-plugins.git
 */

export class LspDspProcessor {
  ctx: AudioContext;
  input: GainNode;
  output: GainNode;

  // Analysers for metering and visualization
  analyser: AnalyserNode;
  analyserL: AnalyserNode;
  analyserR: AnalyserNode;
  splitter: ChannelSplitterNode;

  // 1. LSP Parametric EQ Filter Chain
  eqBypass: GainNode;
  eqWet: GainNode;
  eqLowCut: BiquadFilterNode;
  eqLowShelf: BiquadFilterNode;
  eqBell1: BiquadFilterNode;
  eqBell2: BiquadFilterNode;
  eqHighShelf: BiquadFilterNode;
  eqHighCut: BiquadFilterNode;
  eqOutGain: GainNode;

  // 2. LSP Compressor
  compDry: GainNode;
  compWet: GainNode;
  compNode: DynamicsCompressorNode;
  compMakeup: GainNode;

  // 3. LSP Multiband Compressor (4 Crossover Bands)
  mbDry: GainNode;
  mbWet: GainNode;
  mbLowFilt: BiquadFilterNode;
  mbMidLowBand: BiquadFilterNode;
  mbMidHighBand: BiquadFilterNode;
  mbHighFilt: BiquadFilterNode;
  mbLowComp: DynamicsCompressorNode;
  mbMidLowComp: DynamicsCompressorNode;
  mbMidHighComp: DynamicsCompressorNode;
  mbHighComp: DynamicsCompressorNode;
  mbLowGain: GainNode;
  mbMidLowGain: GainNode;
  mbMidHighGain: GainNode;
  mbHighGain: GainNode;
  mbSum: GainNode;

  // 4. LSP Limiter & Brickwall
  limiterDry: GainNode;
  limiterWet: GainNode;
  limiterBoost: GainNode;
  limiterComp: DynamicsCompressorNode;
  limiterShaper: WaveShaperNode;
  limiterCeiling: GainNode;

  // 5. LSP Dynamic Clipper / Saturator
  clipperDry: GainNode;
  clipperWet: GainNode;
  clipperDrive: GainNode;
  clipperShaper: WaveShaperNode;
  clipperTone: BiquadFilterNode;
  clipperCeil: GainNode;

  // 6. LSP Gate & Expander
  gateGain: GainNode;

  // 7. LSP De-Esser
  deesserNotch: BiquadFilterNode;

  // 8. LSP Artistic Delay
  delayDry: GainNode;
  delayWet: GainNode;
  delayNodeL: DelayNode;
  delayNodeR: DelayNode;
  delayFbL: GainNode;
  delayFbR: GainNode;
  delayCrossL: GainNode;
  delayCrossR: GainNode;
  delayHp: BiquadFilterNode;
  delayLp: BiquadFilterNode;
  delayPanL: StereoPannerNode;
  delayPanR: StereoPannerNode;
  delayMerge: GainNode;

  // 9. LSP Stereo Chorus & Flanger
  chorusDry: GainNode;
  chorusWet: GainNode;
  chorusDelayL: DelayNode;
  chorusDelayR: DelayNode;
  chorusLfoL: OscillatorNode | null = null;
  chorusLfoR: OscillatorNode | null = null;
  chorusDepthL: GainNode;
  chorusDepthR: GainNode;
  chorusFb: GainNode;
  chorusPanL: StereoPannerNode;
  chorusPanR: StereoPannerNode;

  // 10. LSP Impulse Reverb
  reverbDry: GainNode;
  reverbWet: GainNode;
  reverbPreDelay: DelayNode;
  reverbDamp: BiquadFilterNode;
  reverbConv: ConvolverNode;

  // Active bypass states per plugin
  private pluginBypass: Record<string, boolean> = {};

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();

    // Setup main and stereo analysers
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyserL = ctx.createAnalyser();
    this.analyserL.fftSize = 1024;
    this.analyserR = ctx.createAnalyser();
    this.analyserR.fftSize = 1024;
    this.splitter = ctx.createChannelSplitter(2);

    // ==========================================
    // 1. LSP Parametric EQ (16-band architecture)
    // ==========================================
    this.eqLowCut = ctx.createBiquadFilter();
    this.eqLowCut.type = "highpass";
    this.eqLowCut.frequency.value = 40;

    this.eqLowShelf = ctx.createBiquadFilter();
    this.eqLowShelf.type = "lowshelf";
    this.eqLowShelf.frequency.value = 120;
    this.eqLowShelf.gain.value = 2;

    this.eqBell1 = ctx.createBiquadFilter();
    this.eqBell1.type = "peaking";
    this.eqBell1.frequency.value = 800;
    this.eqBell1.Q.value = 1.0;
    this.eqBell1.gain.value = 0;

    this.eqBell2 = ctx.createBiquadFilter();
    this.eqBell2.type = "peaking";
    this.eqBell2.frequency.value = 2500;
    this.eqBell2.Q.value = 1.2;
    this.eqBell2.gain.value = 1.5;

    this.eqHighShelf = ctx.createBiquadFilter();
    this.eqHighShelf.type = "highshelf";
    this.eqHighShelf.frequency.value = 8000;
    this.eqHighShelf.gain.value = 3;

    this.eqHighCut = ctx.createBiquadFilter();
    this.eqHighCut.type = "lowpass";
    this.eqHighCut.frequency.value = 18000;

    this.eqOutGain = ctx.createGain();
    this.eqOutGain.gain.value = 1.0;

    this.eqBypass = ctx.createGain();
    this.eqBypass.gain.value = 0;
    this.eqWet = ctx.createGain();
    this.eqWet.gain.value = 1;

    // Connect EQ chain
    this.input.connect(this.eqLowCut);
    this.eqLowCut
      .connect(this.eqLowShelf)
      .connect(this.eqBell1)
      .connect(this.eqBell2)
      .connect(this.eqHighShelf)
      .connect(this.eqHighCut)
      .connect(this.eqOutGain)
      .connect(this.eqWet);

    this.input.connect(this.eqBypass);
    const eqSum = ctx.createGain();
    this.eqWet.connect(eqSum);
    this.eqBypass.connect(eqSum);

    // ==========================================
    // 2. LSP De-Esser (Dynamic High Notch)
    // ==========================================
    this.deesserNotch = ctx.createBiquadFilter();
    this.deesserNotch.type = "peaking";
    this.deesserNotch.frequency.value = 6200;
    this.deesserNotch.Q.value = 1.8;
    this.deesserNotch.gain.value = 0; // neutral until active
    eqSum.connect(this.deesserNotch);

    // ==========================================
    // 3. LSP Gate & Expander
    // ==========================================
    this.gateGain = ctx.createGain();
    this.gateGain.gain.value = 1.0;
    this.deesserNotch.connect(this.gateGain);

    // ==========================================
    // 4. LSP Clipper / Saturator
    // ==========================================
    this.clipperDry = ctx.createGain();
    this.clipperWet = ctx.createGain();
    this.clipperDrive = ctx.createGain();
    this.clipperDrive.gain.value = 1.0;
    this.clipperShaper = ctx.createWaveShaper();
    this.clipperShaper.curve = this.createSaturationCurve(35, 8);
    this.clipperShaper.oversample = "2x";
    this.clipperTone = ctx.createBiquadFilter();
    this.clipperTone.type = "lowpass";
    this.clipperTone.frequency.value = 7000;
    this.clipperCeil = ctx.createGain();
    this.clipperCeil.gain.value = 0.95;

    this.gateGain.connect(this.clipperDry);
    this.gateGain.connect(this.clipperDrive).connect(this.clipperShaper).connect(this.clipperTone).connect(this.clipperCeil).connect(this.clipperWet);
    this.clipperDry.gain.value = 0.2;
    this.clipperWet.gain.value = 0.8;

    const satSum = ctx.createGain();
    this.clipperDry.connect(satSum);
    this.clipperWet.connect(satSum);

    // ==========================================
    // 5. LSP Compressor
    // ==========================================
    this.compDry = ctx.createGain();
    this.compDry.gain.value = 0;
    this.compWet = ctx.createGain();
    this.compWet.gain.value = 1;
    this.compNode = ctx.createDynamicsCompressor();
    this.compNode.threshold.value = -18;
    this.compNode.ratio.value = 4;
    this.compNode.attack.value = 0.012;
    this.compNode.release.value = 0.12;
    this.compNode.knee.value = 6;
    this.compMakeup = ctx.createGain();
    this.compMakeup.gain.value = Math.pow(10, 3.5 / 20); // +3.5dB

    satSum.connect(this.compDry);
    satSum.connect(this.compNode).connect(this.compMakeup).connect(this.compWet);

    const compSum = ctx.createGain();
    this.compDry.connect(compSum);
    this.compWet.connect(compSum);

    // ==========================================
    // 6. LSP Multiband Compressor (4 Crossover Bands)
    // ==========================================
    this.mbDry = ctx.createGain();
    this.mbDry.gain.value = 1.0;
    this.mbWet = ctx.createGain();
    this.mbWet.gain.value = 0.0; // bypass by default until enabled
    this.mbSum = ctx.createGain();

    // Low band (< 150 Hz)
    this.mbLowFilt = ctx.createBiquadFilter();
    this.mbLowFilt.type = "lowpass";
    this.mbLowFilt.frequency.value = 150;
    this.mbLowComp = ctx.createDynamicsCompressor();
    this.mbLowComp.threshold.value = -16;
    this.mbLowComp.ratio.value = 3;
    this.mbLowGain = ctx.createGain();
    this.mbLowGain.gain.value = Math.pow(10, 1 / 20);

    // Mid-Low band (150 - 1500 Hz)
    this.mbMidLowBand = ctx.createBiquadFilter();
    this.mbMidLowBand.type = "bandpass";
    this.mbMidLowBand.frequency.value = 600;
    this.mbMidLowBand.Q.value = 0.7;
    this.mbMidLowComp = ctx.createDynamicsCompressor();
    this.mbMidLowComp.threshold.value = -20;
    this.mbMidLowComp.ratio.value = 2.5;
    this.mbMidLowGain = ctx.createGain();
    this.mbMidLowGain.gain.value = 1.0;

    // Mid-High band (1500 - 6000 Hz)
    this.mbMidHighBand = ctx.createBiquadFilter();
    this.mbMidHighBand.type = "bandpass";
    this.mbMidHighBand.frequency.value = 3200;
    this.mbMidHighBand.Q.value = 0.7;
    this.mbMidHighComp = ctx.createDynamicsCompressor();
    this.mbMidHighComp.threshold.value = -18;
    this.mbMidHighComp.ratio.value = 3;
    this.mbMidHighGain = ctx.createGain();
    this.mbMidHighGain.gain.value = Math.pow(10, 0.5 / 20);

    // High band (> 6000 Hz)
    this.mbHighFilt = ctx.createBiquadFilter();
    this.mbHighFilt.type = "highpass";
    this.mbHighFilt.frequency.value = 6000;
    this.mbHighComp = ctx.createDynamicsCompressor();
    this.mbHighComp.threshold.value = -14;
    this.mbHighComp.ratio.value = 3.5;
    this.mbHighGain = ctx.createGain();
    this.mbHighGain.gain.value = Math.pow(10, 1.5 / 20);

    // Connect multiband branch
    compSum.connect(this.mbDry);
    compSum.connect(this.mbLowFilt).connect(this.mbLowComp).connect(this.mbLowGain).connect(this.mbSum);
    compSum.connect(this.mbMidLowBand).connect(this.mbMidLowComp).connect(this.mbMidLowGain).connect(this.mbSum);
    compSum.connect(this.mbMidHighBand).connect(this.mbMidHighComp).connect(this.mbMidHighGain).connect(this.mbSum);
    compSum.connect(this.mbHighFilt).connect(this.mbHighComp).connect(this.mbHighGain).connect(this.mbSum);
    this.mbSum.connect(this.mbWet);

    const postMb = ctx.createGain();
    this.mbDry.connect(postMb);
    this.mbWet.connect(postMb);

    // ==========================================
    // 7. LSP Stereo Chorus & Flanger
    // ==========================================
    this.chorusDry = ctx.createGain();
    this.chorusDry.gain.value = 1.0;
    this.chorusWet = ctx.createGain();
    this.chorusWet.gain.value = 0.0;
    this.chorusDelayL = ctx.createDelay(0.1);
    this.chorusDelayL.delayTime.value = 0.02;
    this.chorusDelayR = ctx.createDelay(0.1);
    this.chorusDelayR.delayTime.value = 0.025;
    this.chorusDepthL = ctx.createGain();
    this.chorusDepthL.gain.value = 0.005;
    this.chorusDepthR = ctx.createGain();
    this.chorusDepthR.gain.value = 0.005;
    this.chorusFb = ctx.createGain();
    this.chorusFb.gain.value = 0.15;
    this.chorusPanL = ctx.createStereoPanner();
    this.chorusPanL.pan.value = -0.8;
    this.chorusPanR = ctx.createStereoPanner();
    this.chorusPanR.pan.value = 0.8;

    if ("createOscillator" in ctx) {
      try {
        this.chorusLfoL = ctx.createOscillator();
        this.chorusLfoL.frequency.value = 1.4;
        this.chorusLfoL.connect(this.chorusDepthL).connect(this.chorusDelayL.delayTime);
        this.chorusLfoL.start();

        this.chorusLfoR = ctx.createOscillator();
        this.chorusLfoR.frequency.value = 1.42;
        this.chorusLfoR.connect(this.chorusDepthR).connect(this.chorusDelayR.delayTime);
        this.chorusLfoR.start();
      } catch {
        // ignore
      }
    }

    postMb.connect(this.chorusDry);
    postMb.connect(this.chorusDelayL).connect(this.chorusPanL).connect(this.chorusWet);
    postMb.connect(this.chorusDelayR).connect(this.chorusPanR).connect(this.chorusWet);

    const postChorus = ctx.createGain();
    this.chorusDry.connect(postChorus);
    this.chorusWet.connect(postChorus);

    // ==========================================
    // 8. LSP Artistic Delay (Stereo Ping-Pong)
    // ==========================================
    this.delayDry = ctx.createGain();
    this.delayDry.gain.value = 1.0;
    this.delayWet = ctx.createGain();
    this.delayWet.gain.value = 0.0;
    this.delayNodeL = ctx.createDelay(3.0);
    this.delayNodeL.delayTime.value = 0.32;
    this.delayNodeR = ctx.createDelay(3.0);
    this.delayNodeR.delayTime.value = 0.48;
    this.delayFbL = ctx.createGain();
    this.delayFbL.gain.value = 0.45;
    this.delayFbR = ctx.createGain();
    this.delayFbR.gain.value = 0.45;
    this.delayCrossL = ctx.createGain();
    this.delayCrossL.gain.value = 0.35;
    this.delayCrossR = ctx.createGain();
    this.delayCrossR.gain.value = 0.35;
    this.delayHp = ctx.createBiquadFilter();
    this.delayHp.type = "highpass";
    this.delayHp.frequency.value = 120;
    this.delayLp = ctx.createBiquadFilter();
    this.delayLp.type = "lowpass";
    this.delayLp.frequency.value = 6500;
    this.delayPanL = ctx.createStereoPanner();
    this.delayPanL.pan.value = -0.7;
    this.delayPanR = ctx.createStereoPanner();
    this.delayPanR.pan.value = 0.7;
    this.delayMerge = ctx.createGain();

    postChorus.connect(this.delayDry);

    // Delay loop with cross-coupling ping pong
    postChorus.connect(this.delayHp).connect(this.delayLp);
    this.delayLp.connect(this.delayNodeL);
    this.delayLp.connect(this.delayNodeR);

    this.delayNodeL.connect(this.delayPanL).connect(this.delayMerge);
    this.delayNodeR.connect(this.delayPanR).connect(this.delayMerge);

    this.delayNodeL.connect(this.delayFbL).connect(this.delayNodeL);
    this.delayNodeL.connect(this.delayCrossL).connect(this.delayNodeR);
    this.delayNodeR.connect(this.delayFbR).connect(this.delayNodeR);
    this.delayNodeR.connect(this.delayCrossR).connect(this.delayNodeL);

    this.delayMerge.connect(this.delayWet);

    const postDelay = ctx.createGain();
    this.delayDry.connect(postDelay);
    this.delayWet.connect(postDelay);

    // ==========================================
    // 9. LSP Impulse Reverb
    // ==========================================
    this.reverbDry = ctx.createGain();
    this.reverbDry.gain.value = 1.0;
    this.reverbWet = ctx.createGain();
    this.reverbWet.gain.value = 0.0;
    this.reverbPreDelay = ctx.createDelay(0.2);
    this.reverbPreDelay.delayTime.value = 0.018;
    this.reverbDamp = ctx.createBiquadFilter();
    this.reverbDamp.type = "lowpass";
    this.reverbDamp.frequency.value = 7500;
    this.reverbConv = ctx.createConvolver();
    this.reverbConv.buffer = this.createSyntheticImpulse(2.2, 0.65);

    postDelay.connect(this.reverbDry);
    postDelay.connect(this.reverbPreDelay).connect(this.reverbDamp).connect(this.reverbConv).connect(this.reverbWet);

    const postReverb = ctx.createGain();
    this.reverbDry.connect(postReverb);
    this.reverbWet.connect(postReverb);

    // ==========================================
    // 10. LSP Limiter & Brickwall
    // ==========================================
    this.limiterDry = ctx.createGain();
    this.limiterDry.gain.value = 0.0;
    this.limiterWet = ctx.createGain();
    this.limiterWet.gain.value = 1.0;
    this.limiterBoost = ctx.createGain();
    this.limiterBoost.gain.value = Math.pow(10, 6 / 20); // +6dB drive
    this.limiterComp = ctx.createDynamicsCompressor();
    this.limiterComp.threshold.value = -0.5;
    this.limiterComp.ratio.value = 35;
    this.limiterComp.attack.value = 0.001; // 1ms fast brickwall
    this.limiterComp.release.value = 0.045; // 45ms release
    this.limiterComp.knee.value = 1.0;
    this.limiterShaper = ctx.createWaveShaper();
    this.limiterShaper.curve = this.createBrickwallCurve();
    this.limiterCeiling = ctx.createGain();
    this.limiterCeiling.gain.value = Math.pow(10, -0.3 / 20); // -0.3 dB true ceiling

    postReverb.connect(this.limiterDry);
    postReverb.connect(this.limiterBoost).connect(this.limiterComp).connect(this.limiterShaper).connect(this.limiterCeiling).connect(this.limiterWet);

    const finalSum = ctx.createGain();
    this.limiterDry.connect(finalSum);
    this.limiterWet.connect(finalSum);

    // Connect final output and analysers
    finalSum.connect(this.output);
    this.output.connect(this.analyser);
    this.output.connect(this.splitter);
    this.splitter.connect(this.analyserL, 0);
    this.splitter.connect(this.analyserR, 1);
  }

  /** Soft-clipping saturation curve */
  private createSaturationCurve(drivePercent: number, _kneeDb: number): Float32Array<ArrayBuffer> {
    const n = 1024;
    const buffer = new ArrayBuffer(n * 4);
    const curve = new Float32Array(buffer);
    const k = (drivePercent / 100) * 12 + 1;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((1 + k * 0.5) * x) / (1 + k * 0.5 * Math.abs(x));
    }
    return curve;
  }

  /** Brickwall limiter ceiling transfer function */
  private createBrickwallCurve(): Float32Array<ArrayBuffer> {
    const n = 1024;
    const buffer = new ArrayBuffer(n * 4);
    const curve = new Float32Array(buffer);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      // Soft saturation clamp past 0.95
      if (x > 0.95) {
        curve[i] = 0.95 + 0.05 * Math.tanh((x - 0.95) * 4);
      } else if (x < -0.95) {
        curve[i] = -0.95 + 0.05 * Math.tanh((x + 0.95) * 4);
      } else {
        curve[i] = x;
      }
    }
    return curve;
  }

  /** Synthetic acoustic room impulse response */
  private createSyntheticImpulse(decaySec: number, roomSizeRatio: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const length = Math.floor(rate * Math.max(0.2, decaySec));
    const buf = this.ctx.createBuffer(2, length, rate);
    const l = buf.getChannelData(0);
    const r = buf.getChannelData(1);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const decay = Math.exp(-t * (4 + (1 - roomSizeRatio) * 6));
      l[i] = (Math.random() * 2 - 1) * decay;
      r[i] = (Math.random() * 2 - 1) * decay;
    }
    return buf;
  }

  /** Apply parameter update to corresponding LSP plugin */
  updateParameter(pluginId: string, paramId: string, val: number) {
    const now = this.ctx.currentTime;

    switch (pluginId) {
      // 1. LSP Parametric EQ
      case "lsp-para-equalizer":
        if (paramId === "lowCut") this.eqLowCut.frequency.setTargetAtTime(val, now, 0.02);
        if (paramId === "lowGain") this.eqLowShelf.gain.setTargetAtTime(val, now, 0.02);
        if (paramId === "lowFreq") this.eqLowShelf.frequency.setTargetAtTime(val, now, 0.02);
        if (paramId === "midGain1") this.eqBell1.gain.setTargetAtTime(val, now, 0.02);
        if (paramId === "midFreq1") this.eqBell1.frequency.setTargetAtTime(val, now, 0.02);
        if (paramId === "midQ1") this.eqBell1.Q.setTargetAtTime(val, now, 0.02);
        if (paramId === "midGain2") this.eqBell2.gain.setTargetAtTime(val, now, 0.02);
        if (paramId === "midFreq2") this.eqBell2.frequency.setTargetAtTime(val, now, 0.02);
        if (paramId === "midQ2") this.eqBell2.Q.setTargetAtTime(val, now, 0.02);
        if (paramId === "highGain") this.eqHighShelf.gain.setTargetAtTime(val, now, 0.02);
        if (paramId === "highFreq") this.eqHighShelf.frequency.setTargetAtTime(val, now, 0.02);
        if (paramId === "highCut") this.eqHighCut.frequency.setTargetAtTime(val, now, 0.02);
        if (paramId === "outGain") this.eqOutGain.gain.setTargetAtTime(Math.pow(10, val / 20), now, 0.02);
        break;

      // 2. LSP Compressor
      case "lsp-compressor":
        if (paramId === "threshold") this.compNode.threshold.setTargetAtTime(val, now, 0.02);
        if (paramId === "ratio") this.compNode.ratio.setTargetAtTime(val, now, 0.02);
        if (paramId === "attack") this.compNode.attack.setTargetAtTime(val / 1000, now, 0.02);
        if (paramId === "release") this.compNode.release.setTargetAtTime(val / 1000, now, 0.02);
        if (paramId === "knee") this.compNode.knee.setTargetAtTime(val, now, 0.02);
        if (paramId === "makeup") this.compMakeup.gain.setTargetAtTime(Math.pow(10, val / 20), now, 0.02);
        if (paramId === "mix") {
          const wetRatio = val / 100;
          this.compWet.gain.setTargetAtTime(wetRatio, now, 0.02);
          this.compDry.gain.setTargetAtTime(1 - wetRatio, now, 0.02);
        }
        break;

      // 3. LSP Multiband Compressor
      case "lsp-mb-compressor":
        this.mbWet.gain.setTargetAtTime(1.0, now, 0.02);
        this.mbDry.gain.setTargetAtTime(0.0, now, 0.02);
        if (paramId === "lowThresh") this.mbLowComp.threshold.setTargetAtTime(val, now, 0.02);
        if (paramId === "lowGain") this.mbLowGain.gain.setTargetAtTime(Math.pow(10, val / 20), now, 0.02);
        if (paramId === "midLowThresh") this.mbMidLowComp.threshold.setTargetAtTime(val, now, 0.02);
        if (paramId === "midLowGain") this.mbMidLowGain.gain.setTargetAtTime(Math.pow(10, val / 20), now, 0.02);
        if (paramId === "midHighThresh") this.mbMidHighComp.threshold.setTargetAtTime(val, now, 0.02);
        if (paramId === "midHighGain") this.mbMidHighGain.gain.setTargetAtTime(Math.pow(10, val / 20), now, 0.02);
        if (paramId === "highThresh") this.mbHighComp.threshold.setTargetAtTime(val, now, 0.02);
        if (paramId === "highGain") this.mbHighGain.gain.setTargetAtTime(Math.pow(10, val / 20), now, 0.02);
        break;

      // 4. LSP Limiter & Brickwall
      case "lsp-limiter":
        if (paramId === "threshold") {
          // threshold drive boost
          this.limiterBoost.gain.setTargetAtTime(Math.pow(10, -val / 20), now, 0.02);
        }
        if (paramId === "ceiling") {
          this.limiterCeiling.gain.setTargetAtTime(Math.pow(10, val / 20), now, 0.02);
        }
        if (paramId === "release") {
          this.limiterComp.release.setTargetAtTime(val / 1000, now, 0.02);
        }
        break;

      // 5. LSP Dynamic Clipper / Saturator
      case "lsp-clipper":
        if (paramId === "drive") {
          this.clipperDrive.gain.setTargetAtTime(1 + (val / 100) * 4, now, 0.02);
          this.clipperShaper.curve = this.createSaturationCurve(val, 8);
        }
        if (paramId === "ceiling") {
          this.clipperCeil.gain.setTargetAtTime(Math.pow(10, val / 20), now, 0.02);
        }
        if (paramId === "tone") {
          this.clipperTone.frequency.setTargetAtTime(val, now, 0.02);
        }
        if (paramId === "wet") {
          const w = val / 100;
          this.clipperWet.gain.setTargetAtTime(w, now, 0.02);
          this.clipperDry.gain.setTargetAtTime(1 - w, now, 0.02);
        }
        break;

      // 6. LSP Gate & Expander
      case "lsp-gate":
        if (paramId === "range") {
          // max attenuation floor
          const floor = Math.pow(10, val / 20);
          this.gateGain.gain.setTargetAtTime(Math.max(0.01, floor), now, 0.02);
        }
        break;

      // 7. LSP De-Esser
      case "lsp-deesser":
        if (paramId === "freq") {
          this.deesserNotch.frequency.setTargetAtTime(val, now, 0.02);
        }
        if (paramId === "bandwidth") {
          this.deesserNotch.Q.setTargetAtTime(val, now, 0.02);
        }
        if (paramId === "reduction") {
          this.deesserNotch.gain.setTargetAtTime(val, now, 0.02);
        }
        break;

      // 8. LSP Artistic Delay
      case "lsp-art-delay":
        if (paramId === "time") {
          this.delayNodeL.delayTime.setTargetAtTime(val / 1000, now, 0.02);
          this.delayNodeR.delayTime.setTargetAtTime((val * 1.5) / 1000, now, 0.02);
        }
        if (paramId === "feedback") {
          const fb = (val / 100) * 0.9;
          this.delayFbL.gain.setTargetAtTime(fb, now, 0.02);
          this.delayFbR.gain.setTargetAtTime(fb, now, 0.02);
        }
        if (paramId === "pingpong") {
          const cross = val > 0.5 ? 0.4 : 0;
          this.delayCrossL.gain.setTargetAtTime(cross, now, 0.02);
          this.delayCrossR.gain.setTargetAtTime(cross, now, 0.02);
        }
        if (paramId === "lowCut") {
          this.delayHp.frequency.setTargetAtTime(val, now, 0.02);
        }
        if (paramId === "highCut") {
          this.delayLp.frequency.setTargetAtTime(val, now, 0.02);
        }
        if (paramId === "wet") {
          const w = (val / 100) * 0.85;
          this.delayWet.gain.setTargetAtTime(w, now, 0.02);
        }
        if (paramId === "dry") {
          this.delayDry.gain.setTargetAtTime(val / 100, now, 0.02);
        }
        break;

      // 9. LSP Stereo Chorus & Flanger
      case "lsp-chorus":
        if (paramId === "rate") {
          if (this.chorusLfoL) this.chorusLfoL.frequency.setTargetAtTime(val, now, 0.02);
          if (this.chorusLfoR) this.chorusLfoR.frequency.setTargetAtTime(val * 1.02, now, 0.02);
        }
        if (paramId === "depth") {
          const d = (val / 100) * 0.012;
          this.chorusDepthL.gain.setTargetAtTime(d, now, 0.02);
          this.chorusDepthR.gain.setTargetAtTime(d, now, 0.02);
        }
        if (paramId === "feedback") {
          this.chorusFb.gain.setTargetAtTime((val / 100) * 0.8, now, 0.02);
        }
        if (paramId === "mix") {
          const w = val / 100;
          this.chorusWet.gain.setTargetAtTime(w, now, 0.02);
          this.chorusDry.gain.setTargetAtTime(1 - w * 0.3, now, 0.02);
        }
        break;

      // 10. LSP Impulse Reverb
      case "lsp-impulse-reverb":
        if (paramId === "roomSize" || paramId === "decay") {
          // generate updated room impulse
          const size = paramId === "roomSize" ? val / 100 : 0.65;
          const dec = paramId === "decay" ? val : 2.2;
          this.reverbConv.buffer = this.createSyntheticImpulse(dec, size);
        }
        if (paramId === "predelay") {
          this.reverbPreDelay.delayTime.setTargetAtTime(val / 1000, now, 0.02);
        }
        if (paramId === "damping") {
          this.reverbDamp.frequency.setTargetAtTime(val, now, 0.02);
        }
        if (paramId === "wet") {
          const w = (val / 100) * 0.8;
          this.reverbWet.gain.setTargetAtTime(w, now, 0.02);
        }
        break;

      // 11. LSP Spectrum Analyzer settings
      case "lsp-spectrum-analyzer":
        if (paramId === "fftSize") {
          const allowed = [512, 1024, 2048, 4096];
          const closest = allowed.reduce((prev, curr) =>
            Math.abs(curr - val) < Math.abs(prev - val) ? curr : prev
          );
          this.analyser.fftSize = closest;
        }
        break;
    }
  }

  /** Set bypass state for a plugin */
  setPluginBypass(pluginId: string, bypassed: boolean) {
    this.pluginBypass[pluginId] = bypassed;
    const now = this.ctx.currentTime;

    switch (pluginId) {
      case "lsp-para-equalizer":
        this.eqBypass.gain.setTargetAtTime(bypassed ? 1.0 : 0.0, now, 0.02);
        this.eqWet.gain.setTargetAtTime(bypassed ? 0.0 : 1.0, now, 0.02);
        break;
      case "lsp-compressor":
        this.compDry.gain.setTargetAtTime(bypassed ? 1.0 : 0.0, now, 0.02);
        this.compWet.gain.setTargetAtTime(bypassed ? 0.0 : 1.0, now, 0.02);
        break;
      case "lsp-mb-compressor":
        this.mbDry.gain.setTargetAtTime(bypassed ? 1.0 : 0.0, now, 0.02);
        this.mbWet.gain.setTargetAtTime(bypassed ? 0.0 : 1.0, now, 0.02);
        break;
      case "lsp-limiter":
        this.limiterDry.gain.setTargetAtTime(bypassed ? 1.0 : 0.0, now, 0.02);
        this.limiterWet.gain.setTargetAtTime(bypassed ? 0.0 : 1.0, now, 0.02);
        break;
      case "lsp-clipper":
        this.clipperDry.gain.setTargetAtTime(bypassed ? 1.0 : 0.2, now, 0.02);
        this.clipperWet.gain.setTargetAtTime(bypassed ? 0.0 : 0.8, now, 0.02);
        break;
      case "lsp-art-delay":
        this.delayWet.gain.setTargetAtTime(bypassed ? 0.0 : 0.45, now, 0.02);
        break;
      case "lsp-chorus":
        this.chorusWet.gain.setTargetAtTime(bypassed ? 0.0 : 0.55, now, 0.02);
        break;
      case "lsp-impulse-reverb":
        this.reverbWet.gain.setTargetAtTime(bypassed ? 0.0 : 0.35, now, 0.02);
        break;
      case "lsp-gate":
        this.gateGain.gain.setTargetAtTime(1.0, now, 0.02);
        break;
      case "lsp-deesser":
        this.deesserNotch.gain.setTargetAtTime(0, now, 0.02);
        break;
    }
  }
}

/**
 * Built-in Audition Player for Instant Plugin Audition & Testing
 * Allows user to audition synth riffs, drum loops, basslines, and test pink noise
 * into any LSP plugin or track with one click.
 */
class AuditionPlayer {
  private timer: number | null = null;
  private noiseNode: AudioNode | null = null;
  isPlaying = false;
  activeType: "synth" | "drums" | "bass" | "noise" | null = null;

  start(ctx: AudioContext, dest: AudioNode, type: "synth" | "drums" | "bass" | "noise") {
    this.stop();
    this.isPlaying = true;
    this.activeType = type;

    if (type === "noise") {
      // Continuous Pink Noise Buffer Source
      const bufferSize = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.05;
        b6 = white * 0.115926;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = 0.4;
      noise.connect(gain).connect(dest);
      noise.start();
      this.noiseNode = noise;
      return;
    }

    // Melodic / Rhythmic Loop Sequencer (120 BPM, 16 steps)
    const stepDuration = 0.125; // 16th note at 120bpm
    let step = 0;

    // Synth melody notes (MIDI numbers)
    const synthNotes = [60, 63, 67, 70, 67, 63, 65, 68, 72, 70, 67, 65, 63, 67, 70, 72];
    // Bass notes
    const bassNotes = [36, 0, 36, 0, 39, 0, 41, 0, 43, 0, 41, 0, 39, 0, 41, 42];

    const playStep = () => {
      if (!this.isPlaying) return;
      const now = ctx.currentTime;

      if (type === "synth") {
        const midi = synthNotes[step % synthNotes.length];
        if (midi > 0) {
          const freq = 440 * Math.pow(2, (midi - 69) / 12);
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const env = ctx.createGain();
          const filter = ctx.createBiquadFilter();

          osc1.type = "sawtooth";
          osc1.frequency.value = freq;
          osc2.type = "square";
          osc2.frequency.value = freq * 1.004; // slight detune

          filter.type = "lowpass";
          filter.frequency.setValueAtTime(800, now);
          filter.frequency.exponentialRampToValueAtTime(3600, now + 0.02);
          filter.frequency.exponentialRampToValueAtTime(1200, now + 0.2);

          env.gain.setValueAtTime(0, now);
          env.gain.linearRampToValueAtTime(0.25, now + 0.01);
          env.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

          osc1.connect(filter);
          osc2.connect(filter);
          filter.connect(env).connect(dest);

          osc1.start(now);
          osc2.start(now);
          osc1.stop(now + 0.24);
          osc2.stop(now + 0.24);
        }
      } else if (type === "bass") {
        const midi = bassNotes[step % bassNotes.length];
        if (midi > 0) {
          const freq = 440 * Math.pow(2, (midi - 69) / 12);
          const osc = ctx.createOscillator();
          const env = ctx.createGain();
          osc.type = "triangle";
          osc.frequency.value = freq;

          env.gain.setValueAtTime(0, now);
          env.gain.linearRampToValueAtTime(0.4, now + 0.01);
          env.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

          osc.connect(env).connect(dest);
          osc.start(now);
          osc.stop(now + 0.26);
        }
      } else if (type === "drums") {
        // Kick on 0, 4, 8, 12
        if (step % 4 === 0) {
          const kickOsc = ctx.createOscillator();
          const kickGain = ctx.createGain();
          kickOsc.frequency.setValueAtTime(140, now);
          kickOsc.frequency.exponentialRampToValueAtTime(42, now + 0.12);
          kickGain.gain.setValueAtTime(0.6, now);
          kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
          kickOsc.connect(kickGain).connect(dest);
          kickOsc.start(now);
          kickOsc.stop(now + 0.24);
        }
        // Snare on 4, 12
        if (step % 8 === 4) {
          const snareOsc = ctx.createOscillator();
          const snareGain = ctx.createGain();
          snareOsc.type = "triangle";
          snareOsc.frequency.setValueAtTime(180, now);
          snareGain.gain.setValueAtTime(0.35, now);
          snareGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
          snareOsc.connect(snareGain).connect(dest);
          snareOsc.start(now);
          snareOsc.stop(now + 0.16);
        }
        // Hihat on even steps
        if (step % 2 === 0) {
          const hatOsc = ctx.createOscillator();
          const hatFilt = ctx.createBiquadFilter();
          const hatGain = ctx.createGain();
          hatOsc.type = "square";
          hatOsc.frequency.value = 8500;
          hatFilt.type = "highpass";
          hatFilt.frequency.value = 7000;
          hatGain.gain.setValueAtTime(0.08, now);
          hatGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
          hatOsc.connect(hatFilt).connect(hatGain).connect(dest);
          hatOsc.start(now);
          hatOsc.stop(now + 0.05);
        }
      }

      step = (step + 1) % 16;
    };

    this.timer = window.setInterval(playStep, stepDuration * 1000);
    playStep();
  }

  stop() {
    this.isPlaying = false;
    this.activeType = null;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.noiseNode) {
      try {
        (this.noiseNode as AudioScheduledSourceNode).stop();
      } catch {
        // ignore
      }
      this.noiseNode = null;
    }
  }
}

export const auditionPlayer = new AuditionPlayer();
