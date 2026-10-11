export type InstrumentId =
  | "piano"
  | "bass"
  | "pluck"
  | "pad"
  | "lead"
  | "drums";

export interface MidiNote {
  id: string;
  /** MIDI pitch number (drums use GM note numbers) */
  pitch: number;
  /** position inside clip, in beats */
  start: number;
  /** length in beats */
  duration: number;
  velocity: number;
}

export interface Clip {
  id: string;
  trackId: string;
  name: string;
  kind: "audio" | "midi";
  /** timeline position in seconds */
  start: number;
  /** length in seconds */
  duration: number;
  color: string;
  /** trim offset inside the source buffer, seconds */
  offset: number;
  /** key into the in-memory buffer store (audio clips) */
  bufferId?: string;
  /** beat-locked notes (midi clips) */
  notes?: MidiNote[];
  /** clip length in beats, for midi clips */
  lengthBeats?: number;
}

export interface TrackEffects {
  eqLow: number; // dB -24..24
  eqMid: number; // dB -24..24
  eqHigh: number; // dB -24..24
  compress: boolean;
}

export interface Track {
  id: string;
  name: string;
  kind: "audio" | "instrument";
  instrument: InstrumentId;
  color: string;
  volume: number; // 0..1.2
  pan: number; // -1..1
  muted: boolean;
  solo: boolean;
  armed: boolean;
  monitor: boolean;
  reverbSend: number; // 0..1
  delaySend: number; // 0..1
  effects: TrackEffects;
}

export interface LoopDef {
  id: string;
  name: string;
  category: "Drums" | "Bass" | "Guitar" | "Keys" | "Synth" | "FX";
  instrument: InstrumentId;
  lengthBeats: number;
  color: string;
  /** [beat, pitch, durationBeats, velocity] */
  notes: [number, number, number, number][];
}

export const INSTRUMENT_LABEL: Record<InstrumentId, string> = {
  piano: "Grand Piano",
  bass: "Bass",
  pluck: "Pluck",
  pad: "Pad",
  lead: "Lead",
  drums: "Drum Kit",
};

export const DRUM_NAMES: Record<number, string> = {
  36: "Kick",
  38: "Snare",
  40: "Rim",
  41: "Low Tom",
  43: "Mid Tom",
  45: "High Tom",
  39: "Clap",
  42: "Closed Hat",
  46: "Open Hat",
  49: "Crash",
  51: "Ride",
};
