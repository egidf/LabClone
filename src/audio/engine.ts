import type { Clip, LoopDef, MidiNote, Track } from "../types";
import { getImpulse, playNote } from "./synth";
import { LspDspProcessor, auditionPlayer } from "./lspDsp";

const LOOKAHEAD = 0.12; // seconds scheduled ahead
const STEP_BEATS = 0.25; // scheduler resolution in beats

export interface Channel {
  input: GainNode;
  driveNode: WaveShaperNode;
  driveMix: GainNode;
  driveDry: GainNode;
  low: BiquadFilterNode;
  mid: BiquadFilterNode;
  high: BiquadFilterNode;
  chorusDelay: DelayNode;
  chorusDepthNode: GainNode;
  chorusLfo: OscillatorNode | null;
  chorusMix: GainNode;
  comp: DynamicsCompressorNode | null;
  bypass: GainNode;
  lspDsp: LspDspProcessor;
  vol: GainNode;
  pan: StereoPannerNode;
  revSend: GainNode;
  dlySend: GainNode;
}

function makeDistortionCurve(amount: number) {
  const k = Math.max(0, amount);
  const n = 512;
  const buffer = new ArrayBuffer(n * 4);
  const curve = new Float32Array(buffer);
  const deg = Math.PI / 180;
  for (let i = 0; i < n; ++i) {
    const x = (i * 2) / n - 1;
    if (k === 0) {
      curve[i] = x;
    } else {
      curve[i] = ((3 + k * 0.8) * x * 20 * deg) / (Math.PI + k * 0.8 * Math.abs(x));
    }
  }
  return curve;
}

function buildChannel(
  ctx: BaseAudioContext,
  track: Track,
  dest: AudioNode,
  revBus: AudioNode,
  dlyBus: AudioNode,
): Channel {
  const input = ctx.createGain();

  // Drive / Distortion unit
  const driveNode = ctx.createWaveShaper();
  driveNode.curve = makeDistortionCurve(0);
  driveNode.oversample = "2x";
  const driveMix = ctx.createGain();
  driveMix.gain.value = 0;
  const driveDry = ctx.createGain();
  driveDry.gain.value = 1;
  const driveSum = ctx.createGain();

  input.connect(driveDry).connect(driveSum);
  input.connect(driveNode).connect(driveMix).connect(driveSum);

  // 3-Band Parametric EQ
  const low = ctx.createBiquadFilter();
  low.type = "lowshelf";
  low.frequency.value = 200;
  const mid = ctx.createBiquadFilter();
  mid.type = "peaking";
  mid.frequency.value = 1000;
  mid.Q.value = 0.9;
  const high = ctx.createBiquadFilter();
  high.type = "highshelf";
  high.frequency.value = 3500;

  driveSum.connect(low).connect(mid).connect(high);

  // Subtle Chorus / Modulation
  const chorusDelay = ctx.createDelay(0.05);
  chorusDelay.delayTime.value = 0.025;
  const chorusDepthNode = ctx.createGain();
  chorusDepthNode.gain.value = 0;
  let chorusLfo: OscillatorNode | null = null;
  if ("createOscillator" in ctx) {
    try {
      chorusLfo = (ctx as AudioContext).createOscillator();
      chorusLfo.frequency.value = 1.5;
      chorusLfo.connect(chorusDepthNode);
      chorusDepthNode.connect(chorusDelay.delayTime);
      chorusLfo.start();
    } catch {
      // ignore
    }
  }
  const chorusMix = ctx.createGain();
  chorusMix.gain.value = 0;
  const eqSum = ctx.createGain();

  high.connect(eqSum);
  high.connect(chorusDelay).connect(chorusMix).connect(eqSum);

  // Compressor
  const comp = ctx.createDynamicsCompressor();
  const bypass = ctx.createGain();
  const vol = ctx.createGain();
  const pan = ctx.createStereoPanner();
  const revSend = ctx.createGain();
  const dlySend = ctx.createGain();

  // Dry/wet for compressor
  eqSum.connect(comp);
  eqSum.connect(bypass);
  const compSum = ctx.createGain();
  comp.connect(compSum);
  bypass.connect(compSum);

  // LSP DSP Audio Processor for this channel
  const lspDsp = new LspDspProcessor(ctx as AudioContext);
  compSum.connect(lspDsp.input);
  lspDsp.output.connect(vol).connect(pan).connect(dest);

  revSend.connect(revBus);
  dlySend.connect(dlyBus);
  vol.connect(revSend);
  vol.connect(dlySend);

  const ch: Channel = {
    input,
    driveNode,
    driveMix,
    driveDry,
    low,
    mid,
    high,
    chorusDelay,
    chorusDepthNode,
    chorusLfo,
    chorusMix,
    comp,
    bypass,
    lspDsp,
    vol,
    pan,
    revSend,
    dlySend,
  };
  updateChannel(ch, track);
  return ch;
}

function updateChannel(ch: Channel, track: Track) {
  const fx = track.effects;
  ch.low.gain.value = fx.eqLow ?? 0;
  ch.mid.gain.value = fx.eqMid ?? 0;
  ch.high.gain.value = fx.eqHigh ?? 0;

  // Drive pedal
  const driveAmount = fx.drive ?? 0;
  if (driveAmount > 0) {
    ch.driveNode.curve = makeDistortionCurve(driveAmount);
    ch.driveMix.gain.value = Math.min(1, driveAmount / 60);
    ch.driveDry.gain.value = Math.max(0, 1 - driveAmount / 120);
  } else {
    ch.driveMix.gain.value = 0;
    ch.driveDry.gain.value = 1;
  }

  // Chorus pedal
  const chorusDepth = fx.chorusDepth ?? 0;
  if (chorusDepth > 0) {
    ch.chorusDepthNode.gain.value = (chorusDepth / 100) * 0.008;
    ch.chorusMix.gain.value = (chorusDepth / 100) * 0.7;
    if (ch.chorusLfo && fx.chorusSpeed) {
      ch.chorusLfo.frequency.value = 0.5 + (fx.chorusSpeed / 100) * 4;
    }
  } else {
    ch.chorusMix.gain.value = 0;
    ch.chorusDepthNode.gain.value = 0;
  }

  // Compressor
  if (ch.comp) {
    ch.comp.threshold.value = fx.compress ? -18 : 0;
    ch.comp.ratio.value = fx.compress ? 4 : 1;
  }
  ch.bypass.gain.value = fx.compress ? 0.3 : 1;

  // Sync LSP plugins from track's effects rack if present
  if (track.effectsRack) {
    for (const unit of track.effectsRack) {
      if (unit.type === "lsp" && unit.lspPluginId) {
        ch.lspDsp.setPluginBypass(unit.lspPluginId, !unit.enabled);
        if (unit.enabled) {
          for (const [pKey, pVal] of Object.entries(unit.params)) {
            ch.lspDsp.updateParameter(unit.lspPluginId, pKey, Number(pVal));
          }
        }
      }
    }
  }

  ch.vol.gain.value = track.muted ? 0 : track.volume;
  ch.pan.pan.value = track.pan;
  ch.revSend.gain.value = track.reverbSend;
  ch.dlySend.gain.value = track.delaySend;
}

function buildMaster(ctx: BaseAudioContext, revBus: AudioNode, dlyBus: AudioNode) {
  const sum = ctx.createGain();
  const masterLspDsp = new LspDspProcessor(ctx as AudioContext);
  const out = ctx.createGain();
  out.gain.value = 0.95;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  sum.connect(masterLspDsp.input);
  masterLspDsp.output.connect(out).connect(analyser);
  analyser.connect(ctx.destination);
  revBus.connect(sum);
  dlyBus.connect(sum);
  return { sum, out, analyser, masterLspDsp };
}

interface SchedulingCursor {
  ctxTime: number;
  beats: number;
  loopIter: number;
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  masterLspDsp: LspDspProcessor | null = null;
  private channels = new Map<string, Channel>();
  private revBus: GainNode | null = null;
  private dlyBus: GainNode | null = null;
  private masterSum: GainNode | null = null;
  private masterOut: GainNode | null = null;
  masterAnalyser: AnalyserNode | null = null;
  private trackAnalyzers = new Map<string, AnalyserNode>();
  private timer: number | null = null;
  private cursor: SchedulingCursor = { ctxTime: 0, beats: 0, loopIter: 0 };

  playing = false;
  recording = false;
  bpm = 120;
  loopEnabled = false;
  loopStart = 0; // beats
  loopEnd = 8; // beats
  metronome = false;

  private startPos = 0; // seconds at startCtxTime
  private startCtxTime = 0;
  private mediaRecorder: MediaRecorder | null = null;
  private recChunks: Blob[] = [];

  /** data providers injected by the app so the engine stays stateless-ish */
  getTracks: () => Track[] = () => [];
  getClips: () => Clip[] = () => [];
  buffers = new Map<string, AudioBuffer>();
  onRecorded: ((trackId: string, blob: Blob, buffer: AudioBuffer | null) => void) | null = null;

  get spb() {
    return 60 / this.bpm;
  }

  ensure(): AudioContext {
    if (!this.ctx) {
      const ctx = new AudioContext();
      this.ctx = ctx;

      // reverb bus: input -> generated impulse -> return gain
      const revBus = ctx.createGain();
      const conv = ctx.createConvolver();
      conv.buffer = getImpulse(ctx);
      const revOut = ctx.createGain();
      revOut.gain.value = 0.9;
      revBus.connect(conv).connect(revOut);

      // delay bus: input -> feedback delay -> filtered return
      const dlyBus = ctx.createGain();
      const delay = ctx.createDelay(2);
      delay.delayTime.value = 0.34;
      const fb = ctx.createGain();
      fb.gain.value = 0.38;
      const dlyFilt = ctx.createBiquadFilter();
      dlyFilt.type = "lowpass";
      dlyFilt.frequency.value = 2600;
      const dlyOut = ctx.createGain();
      dlyOut.gain.value = 0.8;
      dlyBus.connect(delay).connect(dlyFilt).connect(fb).connect(delay);
      dlyFilt.connect(dlyOut);

      const { sum, out, analyser, masterLspDsp } = buildMaster(ctx, revOut, dlyOut);
      this.revBus = revBus;
      this.dlyBus = dlyBus;
      this.masterSum = sum;
      this.masterOut = out;
      this.masterAnalyser = analyser;
      this.masterLspDsp = masterLspDsp;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  getLspDsp(trackId?: string | null): LspDspProcessor | null {
    this.ensure();
    if (!trackId || trackId === "master") return this.masterLspDsp;
    return this.channels.get(trackId)?.lspDsp ?? this.masterLspDsp;
  }

  getLspAnalysers(trackId?: string | null) {
    this.ensure();
    const dsp = this.getLspDsp(trackId);
    if (dsp) {
      return {
        analyser: dsp.analyser,
        analyserL: dsp.analyserL,
        analyserR: dsp.analyserR,
      };
    }
    return {
      analyser: this.masterAnalyser,
      analyserL: this.masterAnalyser,
      analyserR: this.masterAnalyser,
    };
  }

  updateLspParam(target: string, pluginId: string, paramId: string, val: number) {
    this.ensure();
    const dsp = this.getLspDsp(target);
    if (dsp) {
      dsp.updateParameter(pluginId, paramId, val);
    }
  }

  setLspBypass(target: string, pluginId: string, bypassed: boolean) {
    this.ensure();
    const dsp = this.getLspDsp(target);
    if (dsp) {
      dsp.setPluginBypass(pluginId, bypassed);
    }
  }

  startAudition(target: string, type: "synth" | "drums" | "bass" | "noise") {
    const ctx = this.ensure();
    let dest: AudioNode = this.masterSum!;
    if (target && target !== "master") {
      const ch = this.channels.get(target);
      if (ch) dest = ch.input;
    }
    auditionPlayer.start(ctx, dest, type);
  }

  stopAudition() {
    auditionPlayer.stop();
  }

  get isAuditionPlaying() {
    return auditionPlayer.isPlaying;
  }

  get auditionType() {
    return auditionPlayer.activeType;
  }

  syncTracks(tracks: Track[]) {
    const ctx = this.ensure();
    for (const t of tracks) {
      let ch = this.channels.get(t.id);
      if (!ch) {
        ch = buildChannel(ctx, t, this.masterSum!, this.revBus!, this.dlyBus ?? this.masterSum!);
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        ch.pan.connect(an);
        this.trackAnalyzers.set(t.id, an);
        this.channels.set(t.id, ch);
      } else {
        updateChannel(ch, t);
      }
    }
    const anySolo = tracks.some((t) => t.solo);
    for (const t of tracks) {
      const ch = this.channels.get(t.id)!;
      const audible = !t.muted && (!anySolo || t.solo);
      ch.vol.gain.setTargetAtTime(audible ? t.volume : 0, ctx.currentTime, 0.01);
    }
  }

  getTrackAnalyser(id: string) {
    return this.trackAnalyzers.get(id) ?? null;
  }

  /** register an AudioBuffer under an id */
  addBuffer(id: string, buf: AudioBuffer) {
    this.buffers.set(id, buf);
  }

  setMasterGain(dbOrGain: number) {
    this.ensure();
    if (this.masterOut && this.ctx) {
      // If negative or <= 6, assume dB; if 0..2 assume linear
      const linear = dbOrGain <= 3 && dbOrGain >= -40 ? Math.pow(10, dbOrGain / 20) : Math.max(0, dbOrGain);
      this.masterOut.gain.setTargetAtTime(Math.min(1.5, Math.max(0, linear)), this.ctx.currentTime, 0.02);
    }
  }

  get pos(): number {
    if (!this.playing || !this.ctx) return this.startPos;
    const raw = this.startPos + (this.ctx.currentTime - this.startCtxTime);
    return this.wrapPos(raw);
  }

  setPos(sec: number) {
    this.startPos = Math.max(0, sec);
    if (this.ctx) this.startCtxTime = this.ctx.currentTime;
    if (this.playing) {
      this.stopInternalScheduling();
      this.startScheduling();
    }
  }

  private wrapPos(sec: number): number {
    if (!this.loopEnabled) return sec;
    const ls = this.loopStart * this.spb;
    const le = this.loopEnd * this.spb;
    if (sec >= le) {
      const len = le - ls;
      if (len <= 0) return sec;
      return ls + ((sec - ls) % len);
    }
    return sec;
  }

  play(): () => void {
    const ctx = this.ensure();
    this.playing = true;
    this.startCtxTime = ctx.currentTime + 0.06;
    this.startScheduling();
    this.timer = window.setInterval(() => this.tick(), 25);
    this.tick();
    return () => this.stop();
  }

  stop() {
    this.playing = false;
    this.stopInternalScheduling();
    this.startPos = 0;
  }

  pause() {
    if (!this.playing) return;
    this.startPos = this.pos;
    this.playing = false;
    this.stopInternalScheduling();
  }

  private stopInternalScheduling() {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  private startScheduling() {
    this.cursor = {
      ctxTime: this.startCtxTime,
      beats: this.startPos / this.spb,
      loopIter: 0,
    };
  }

  private tick() {
    if (!this.playing || !this.ctx) return;
    const horizon = this.ctx.currentTime + LOOKAHEAD;
    let guard = 0;
    while (this.cursor.ctxTime < horizon && guard++ < 128) {
      const b0 = this.cursor.beats;
      const b1 = b0 + STEP_BEATS;
      this.scheduleWindow(b0, b1, this.cursor.ctxTime);
      this.cursor.ctxTime += STEP_BEATS * this.spb;
      this.cursor.beats = b1;
      if (this.loopEnabled && this.cursor.beats >= this.loopEnd) {
        this.cursor.beats =
          this.loopStart + ((this.cursor.beats - this.loopStart) % (this.loopEnd - this.loopStart));
        this.cursor.loopIter++;
      }
    }
  }

  private scheduleWindow(b0: number, b1: number, ctxTime: number) {
    const ctx = this.ctx!;
    const spb = this.spb;
    if (this.metronome) this.scheduleClick(b0, ctxTime);
    const justWrapped = this.loopEnabled && Math.abs(b0 - this.loopStart) < 1e-6;
    for (const clip of this.getClips()) {
      const track = this.getTracks().find((t) => t.id === clip.trackId);
      if (!track) continue;
      const ch = this.channels.get(track.id);
      if (!ch) continue;
      const audible = this.isAudible(track);
      if (!audible) continue;
      const clipStartBeat = clip.start / spb;
      const clipEndBeat = clipStartBeat + clip.duration / spb;
      if (clip.kind === "midi" && clip.notes) {
        for (const note of clip.notes) {
          const absBeat = clipStartBeat + note.start;
          if (absBeat >= b0 && absBeat < b1) {
            const when = ctxTime + (absBeat - b0) * spb;
            this.scheduleMidiNote(ctx, ch.input, track.instrument, note, when, spb);
          }
        }
      } else if (clip.kind === "audio" && clip.bufferId) {
        const buf = this.buffers.get(clip.bufferId);
        if (!buf) continue;
        if (clipStartBeat >= b0 && clipStartBeat < b1) {
          const when = ctxTime + (clipStartBeat - b0) * spb;
          this.playBuffer(buf, ch, when, clip.offset, clip.duration);
        } else if (justWrapped && clipStartBeat < b0 && clipEndBeat > b0) {
          const when = ctxTime;
          const offset = clip.offset + (b0 - clipStartBeat) * spb;
          const dur = clip.duration - (b0 - clipStartBeat) * spb;
          if (dur > 0.02) this.playBuffer(buf, ch, when, offset, Math.min(dur, clip.duration));
        }
      }
    }
  }

  private isAudible(track: Track) {
    const tracks = this.getTracks();
    const anySolo = tracks.some((t) => t.solo);
    return !track.muted && (!anySolo || track.solo);
  }

  private playBuffer(
    buf: AudioBuffer,
    ch: Channel,
    when: number,
    offset: number,
    duration: number,
  ) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = 1;
    src.connect(g).connect(ch.input);
    const maxDur = Math.max(0.05, Math.min(duration, buf.duration - offset));
    src.start(when, Math.max(0, offset), maxDur);
  }

  private scheduleMidiNote(
    ctx: BaseAudioContext,
    dest: AudioNode,
    instrument: Track["instrument"],
    note: MidiNote,
    when: number,
    spb: number,
  ) {
    const t = Math.max(when, ctx.currentTime);
    playNote(ctx, dest, instrument, note.pitch, t, Math.max(0.06, note.duration * spb), note.velocity);
  }

  private scheduleClick(b0: number, ctxTime: number) {
    const ctx = this.ctx!;
    const beatInStep = b0 % 1;
    if (Math.abs(beatInStep) > 1e-6) return;
    const beatNum = Math.round(b0);
    const accent = beatNum % 4 === 0;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = accent ? 1800 : 1200;
    g.gain.setValueAtTime(accent ? 0.28 : 0.16, ctxTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctxTime + 0.05);
    o.connect(g).connect(this.masterSum!);
    o.start(ctxTime);
    o.stop(ctxTime + 0.06);
  }

  /** Live audition of a note (piano roll / library). */
  audition(instrument: Track["instrument"], pitch: number, duration = 0.5, velocity = 0.9) {
    const ctx = this.ensure();
    const g = ctx.createGain();
    g.gain.value = 0.9;
    g.connect(this.masterSum!);
    playNote(ctx, g, instrument, pitch, ctx.currentTime + 0.01, duration, velocity);
  }

  /** Preview a library loop on repeat until stopped. */
  private previewStop: (() => void) | null = null;
  preview(loop: LoopDef) {
    this.stopPreview();
    const ctx = this.ensure();
    const g = ctx.createGain();
    g.gain.value = 0.85;
    g.connect(this.masterSum!);
    const spb = this.spb;
    let iter = 0;
    const schedule = () => {
      const base = ctx.currentTime + 0.08 + iter * loop.lengthBeats * spb;
      for (const [beat, pitch, dur, vel] of loop.notes) {
        playNote(ctx, g, loop.instrument, pitch, base + beat * spb, dur * spb, vel);
      }
      iter++;
    };
    schedule();
    const iv = window.setInterval(schedule, loop.lengthBeats * spb * 1000);
    this.previewStop = () => {
      window.clearInterval(iv);
      g.disconnect();
    };
  }

  stopPreview() {
    this.previewStop?.();
    this.previewStop = null;
  }

  async startRecording(trackId: string): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    this.ensure();
    const rec = new MediaRecorder(stream);
    this.mediaRecorder = rec;
    this.recChunks = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) this.recChunks.push(e.data);
    };
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(this.recChunks, { type: rec.mimeType || "audio/webm" });
      this.recording = false;
      if (this.onRecorded) {
        const buf = await this.decode(blob);
        this.onRecorded(trackId, blob, buf);
      }
    };
    rec.start();
    this.recording = true;
  }

  stopRecording() {
    this.mediaRecorder?.stop();
    this.mediaRecorder = null;
  }

  async decode(blob: Blob): Promise<AudioBuffer | null> {
    const ctx = this.ensure();
    try {
      const ab = await blob.arrayBuffer();
      return await ctx.decodeAudioData(ab);
    } catch {
      return null;
    }
  }

  async renderProject(
    tracks: Track[],
    clips: Clip[],
    bpm: number,
    totalSec: number,
  ): Promise<AudioBuffer> {
    const sr = 44100;
    const length = Math.ceil((totalSec + 2.5) * sr);
    const off = new OfflineAudioContext(2, length, sr);
    const revBus = off.createGain();
    const conv = off.createConvolver();
    conv.buffer = getImpulse(off);
    const revOut = off.createGain();
    revOut.gain.value = 0.9;
    revBus.connect(conv).connect(revOut);
    const delayBus = off.createGain();
    const delay = off.createDelay(2);
    delay.delayTime.value = 0.34;
    const fb = off.createGain();
    fb.gain.value = 0.38;
    const filt = off.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 2600;
    const dlyOut = off.createGain();
    dlyOut.gain.value = 0.8;
    delayBus.connect(delay).connect(filt).connect(fb).connect(delay);
    filt.connect(dlyOut);
    const { sum } = buildMaster(off, revOut, dlyOut);
    const spb = 60 / bpm;
    const chans = new Map<string, Channel>();
    for (const t of tracks) {
      chans.set(t.id, buildChannel(off, t, sum, revBus, delayBus));
    }
    for (const clip of clips) {
      const ch = chans.get(clip.trackId);
      const track = tracks.find((t) => t.id === clip.trackId);
      if (!ch || !track) continue;
      if (clip.kind === "midi" && clip.notes) {
        for (const note of clip.notes) {
          playNote(
            off,
            ch.input,
            track.instrument,
            note.pitch,
            clip.start + note.start * spb,
            Math.max(0.06, note.duration * spb),
            note.velocity,
          );
        }
      } else if (clip.kind === "audio" && clip.bufferId) {
        // re-decode is not possible offline; buffers are sample-rate specific but
        // OfflineAudioContext resamples buffer sources automatically.
        const buf = this.buffers.get(clip.bufferId);
        if (!buf) continue;
        const src = off.createBufferSource();
        src.buffer = buf;
        src.connect(ch.input);
        src.start(clip.start, clip.offset, Math.max(0.05, clip.duration));
      }
    }
    return off.startRendering();
  }
}

export const engine = new AudioEngine();
