import type { InstrumentId } from "../types";

/** Cache of shared per-context resources (noise buffers, impulse responses). */
const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();
const impulseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

export function getNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseCache.get(ctx);
  if (!buf) {
    const len = Math.floor(ctx.sampleRate * 2);
    buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, buf);
  }
  return buf;
}

/** Generated plate-ish reverb impulse so we need no audio assets. */
export function getImpulse(ctx: BaseAudioContext): AudioBuffer {
  let buf = impulseCache.get(ctx);
  if (!buf) {
    const len = Math.floor(ctx.sampleRate * 2.2);
    buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.8);
      }
    }
    impulseCache.set(ctx, buf);
  }
  return buf;
}

export function midiToHz(pitch: number): number {
  return 440 * Math.pow(2, (pitch - 69) / 12);
}

function env(
  ctx: BaseAudioContext,
  gain: GainNode,
  time: number,
  attack: number,
  decay: number,
  sustainLevel: number,
  hold: number,
  release: number,
) {
  const g = gain.gain;
  g.cancelScheduledValues(time);
  g.setValueAtTime(0.0001, time);
  g.exponentialRampToValueAtTime(Math.max(0.0002, sustainLevel), time + attack);
  g.setValueAtTime(Math.max(0.0002, sustainLevel), time + attack + hold);
  g.exponentialRampToValueAtTime(0.0001, time + attack + hold + release + decay);
}

function osc(
  ctx: BaseAudioContext,
  type: OscillatorType,
  freq: number,
  detune = 0,
): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = detune;
  return o;
}

/** Percussion voices. pitch uses General-MIDI-ish note numbers. */
function playDrum(
  ctx: BaseAudioContext,
  dest: AudioNode,
  pitch: number,
  time: number,
  velocity: number,
) {
  const v = Math.max(0.05, velocity);
  const noise = ctx.createBufferSource();
  noise.buffer = getNoiseBuffer(ctx);

  if (pitch === 36 || pitch === 35) {
    // kick
    const o = osc(ctx, "sine", 140);
    const g = ctx.createGain();
    o.frequency.setValueAtTime(160, time);
    o.frequency.exponentialRampToValueAtTime(45, time + 0.12);
    g.gain.setValueAtTime(v, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.32);
    o.connect(g).connect(dest);
    o.start(time);
    o.stop(time + 0.35);
  } else if (pitch === 38 || pitch === 40) {
    // snare
    const body = osc(ctx, "triangle", pitch === 38 ? 190 : 320);
    const g = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    filt.type = "highpass";
    filt.frequency.value = 1200;
    body.connect(g);
    noise.connect(filt).connect(g);
    g.gain.setValueAtTime(v * 0.9, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
    g.connect(dest);
    body.start(time);
    noise.start(time);
    body.stop(time + 0.2);
    noise.stop(time + 0.2);
  } else if (pitch === 39) {
    // clap
    const filt = ctx.createBiquadFilter();
    filt.type = "bandpass";
    filt.frequency.value = 1500;
    filt.Q.value = 1.2;
    const g = ctx.createGain();
    noise.connect(filt).connect(g).connect(dest);
    for (let i = 0; i < 3; i++) {
      const t = time + i * 0.012;
      g.gain.setValueAtTime(v * 0.7, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.02);
    }
    g.gain.setValueAtTime(v * 0.8, time + 0.036);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);
    noise.start(time);
    noise.stop(time + 0.25);
  } else if (pitch === 42 || pitch === 44 || pitch === 46) {
    // hats
    const filt = ctx.createBiquadFilter();
    filt.type = "highpass";
    filt.frequency.value = 7000;
    const g = ctx.createGain();
    noise.connect(filt).connect(g).connect(dest);
    const len = pitch === 46 ? 0.28 : 0.055;
    g.gain.setValueAtTime(v * 0.5, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + len);
    noise.start(time);
    noise.stop(time + len + 0.02);
  } else if (pitch === 49 || pitch === 57) {
    // crash
    const filt = ctx.createBiquadFilter();
    filt.type = "highpass";
    filt.frequency.value = 4000;
    const g = ctx.createGain();
    noise.connect(filt).connect(g).connect(dest);
    g.gain.setValueAtTime(v * 0.45, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 1.6);
    noise.start(time);
    noise.stop(time + 1.7);
  } else if (pitch === 51 || pitch === 53) {
    // ride
    const filt = ctx.createBiquadFilter();
    filt.type = "bandpass";
    filt.frequency.value = 6500;
    const g = ctx.createGain();
    noise.connect(filt).connect(g).connect(dest);
    g.gain.setValueAtTime(v * 0.3, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.6);
    noise.start(time);
    noise.stop(time + 0.65);
  } else {
    // toms
    const freqs: Record<number, number> = { 41: 110, 43: 150, 45: 200, 47: 260, 48: 320 };
    const o = osc(ctx, "sine", freqs[pitch] ?? 180);
    const g = ctx.createGain();
    o.frequency.setValueAtTime((freqs[pitch] ?? 180) * 1.4, time);
    o.frequency.exponentialRampToValueAtTime(freqs[pitch] ?? 180, time + 0.08);
    g.gain.setValueAtTime(v * 0.8, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.3);
    o.connect(g).connect(dest);
    o.start(time);
    o.stop(time + 0.32);
  }
}

/** Schedule one melodic note for the given instrument. */
export function playNote(
  ctx: BaseAudioContext,
  dest: AudioNode,
  instrument: InstrumentId,
  pitch: number,
  time: number,
  duration: number,
  velocity = 0.9,
) {
  if (instrument === "drums") {
    playDrum(ctx, dest, pitch, time, velocity);
    return;
  }
  const freq = midiToHz(pitch);
  const v = Math.max(0.02, velocity);
  const g = ctx.createGain();
  g.connect(dest);

  if (instrument === "piano") {
    const o1 = osc(ctx, "triangle", freq);
    const o2 = osc(ctx, "sine", freq * 2, 4);
    const g2 = ctx.createGain();
    g2.gain.value = 0.35;
    o1.connect(g);
    o2.connect(g2).connect(g);
    env(ctx, g, time, 0.005, 0.25, v * 0.7, Math.min(duration, 0.6), 0.5);
    o1.start(time);
    o2.start(time);
    o1.stop(time + duration + 0.7);
    o2.stop(time + duration + 0.7);
  } else if (instrument === "bass") {
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.setValueAtTime(900, time);
    filt.frequency.exponentialRampToValueAtTime(260, time + Math.min(duration, 0.5));
    filt.Q.value = 6;
    const o1 = osc(ctx, "sawtooth", freq);
    const o2 = osc(ctx, "square", freq / 2);
    const g2 = ctx.createGain();
    g2.gain.value = 0.4;
    o1.connect(filt);
    o2.connect(g2).connect(filt);
    filt.connect(g);
    env(ctx, g, time, 0.008, 0.1, v * 0.55, Math.max(0.02, duration - 0.05), 0.08);
    o1.start(time);
    o2.start(time);
    o1.stop(time + duration + 0.2);
    o2.stop(time + duration + 0.2);
  } else if (instrument === "pluck") {
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 2600;
    const o = osc(ctx, "triangle", freq);
    o.connect(filt).connect(g);
    env(ctx, g, time, 0.004, 0.2, v * 0.5, 0.02, 0.25);
    o.start(time);
    o.stop(time + duration + 0.4);
  } else if (instrument === "pad") {
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 1500;
    filt.Q.value = 1;
    const oscs = [-7, 0, 7].map((d) => {
      const o = osc(ctx, "sawtooth", freq, d);
      o.connect(filt);
      o.start(time);
      o.stop(time + duration + 1.2);
      return o;
    });
    void oscs;
    filt.connect(g);
    env(ctx, g, time, 0.25, 0.4, v * 0.22, Math.max(0.05, duration - 0.3), 0.8);
  } else {
    // lead
    const o = osc(ctx, "square", freq);
    const lfo = osc(ctx, "sine", 5.5);
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 6;
    lfo.connect(lfoGain).connect(o.detune);
    lfo.start(time);
    lfo.stop(time + duration + 0.3);
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 3200;
    o.connect(filt).connect(g);
    env(ctx, g, time, 0.02, 0.15, v * 0.35, Math.max(0.05, duration - 0.1), 0.2);
    o.start(time);
    o.stop(time + duration + 0.35);
  }
}
