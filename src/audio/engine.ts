import type { Clip, LoopDef, MidiNote, Track } from "../types";
import { getImpulse, playNote } from "./synth";

const LOOKAHEAD = 0.12; // seconds scheduled ahead
const STEP_BEATS = 0.25; // scheduler resolution in beats

export interface Channel {
  input: GainNode;
  low: BiquadFilterNode;
  mid: BiquadFilterNode;
  high: BiquadFilterNode;
  comp: DynamicsCompressorNode | null;
  bypass: GainNode;
  vol: GainNode;
  pan: StereoPannerNode;
  revSend: GainNode;
  dlySend: GainNode;
}

function buildChannel(
  ctx: BaseAudioContext,
  track: Track,
  dest: AudioNode,
  revBus: AudioNode,
  dlyBus: AudioNode,
): Channel {
  const input = ctx.createGain();
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
  const comp = ctx.createDynamicsCompressor();
  const bypass = ctx.createGain();
  const vol = ctx.createGain();
  const pan = ctx.createStereoPanner();
  const revSend = ctx.createGain();
  const dlySend = ctx.createGain();

  input.connect(low).connect(mid).connect(high);
  high.connect(comp);
  high.connect(bypass);
  comp.connect(bypass);
  bypass.connect(vol).connect(pan).connect(dest);
  revSend.connect(revBus);
  dlySend.connect(dlyBus);
  vol.connect(revSend);
  vol.connect(dlySend);

  const ch: Channel = { input, low, mid, high, comp, bypass, vol, pan, revSend, dlySend };
  updateChannel(ch, track);
  return ch;
}

function updateChannel(ch: Channel, track: Track) {
  ch.low.gain.value = track.effects.eqLow;
  ch.mid.gain.value = track.effects.eqMid;
  ch.high.gain.value = track.effects.eqHigh;
  if (ch.comp) ch.comp.threshold.value = track.effects.compress ? -18 : 0;
  if (ch.comp) ch.comp.ratio.value = track.effects.compress ? 4 : 1;
  ch.bypass.gain.value = track.effects.compress ? 0 : 1;
  ch.vol.gain.value = track.muted ? 0 : track.volume;
  ch.pan.pan.value = track.pan;
  ch.revSend.gain.value = track.reverbSend;
  ch.dlySend.gain.value = track.delaySend;
}

function buildMaster(ctx: BaseAudioContext, revBus: AudioNode, dlyBus: AudioNode) {
  const sum = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -8;
  comp.ratio.value = 3;
  const out = ctx.createGain();
  out.gain.value = 0.95;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  sum.connect(comp).connect(out).connect(analyser);
  analyser.connect(ctx.destination);
  revBus.connect(sum);
  dlyBus.connect(sum);
  return { sum, out, analyser };
}

interface SchedulingCursor {
  ctxTime: number;
  beats: number;
  loopIter: number;
}

export class AudioEngine {
  ctx: AudioContext | null = null;
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

      const { sum, out, analyser } = buildMaster(ctx, revOut, dlyOut);
      this.revBus = revBus;
      this.dlyBus = dlyBus;
      this.masterSum = sum;
      this.masterOut = out;
      this.masterAnalyser = analyser;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
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
