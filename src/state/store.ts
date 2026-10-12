import { create } from "zustand";
import type { Clip, InstrumentId, LoopDef, MidiNote, Track } from "../types";
import { engine } from "../audio/engine";

export const uid = () => Math.random().toString(36).slice(2, 10);

export const TRACK_COLORS = [
  "#f2543d",
  "#3d8bfd",
  "#26c281",
  "#a86dfd",
  "#f7b32b",
  "#ff7bac",
  "#22d3ee",
  "#c0c5ce",
];

export interface Snapshot {
  name: string;
  tempo: number;
  tracks: Track[];
  clips: Clip[];
}

export type BottomPanel = "none" | "loops" | "mixer" | "fx" | "mastering" | "piano" | "instrument" | "lsp";

interface Store extends Snapshot {
  // transport / ui
  isPlaying: boolean;
  isRecording: boolean;
  metronome: boolean;
  loopEnabled: boolean;
  loopStartBeat: number;
  loopEndBeat: number;
  selectedTrackId: string | null;
  selectedClipId: string | null;
  pxPerSec: number;
  snapDiv: number; // snap resolution in beats (0.25 = 16th note)
  bottomPanel: BottomPanel;
  leftPanelOpen: boolean;
  masteringOpen: boolean;
  toast: string | null;

  // history
  past: Snapshot[];
  future: Snapshot[];

  // actions
  setProjectName: (name: string) => void;
  setTempo: (bpm: number) => void;
  addTrack: (kind: Track["kind"], instrument?: InstrumentId) => string;
  deleteTrack: (id: string) => void;
  updateTrack: (id: string, patch: Partial<Track>, record?: boolean) => void;
  armOnly: (id: string) => void;
  duplicateTrack: (id: string) => void;
  addLoopClip: (loop: LoopDef, trackId: string, atSec: number) => void;
  addAudioClip: (trackId: string, bufferId: string, duration: number, atSec: number, name: string) => void;
  deleteClip: (id: string) => void;
  updateClip: (id: string, patch: Partial<Clip>, record?: boolean) => void;
  getSnapshot: () => Snapshot;
  recordHistory: (snap: Snapshot) => void;
  moveClip: (id: string, startSec: number) => void;
  selectClip: (id: string | null) => void;
  selectTrack: (id: string | null) => void;
  addNote: (clipId: string, note: Omit<MidiNote, "id">) => void;
  updateNote: (clipId: string, noteId: string, patch: Partial<MidiNote>, record?: boolean) => void;
  deleteNote: (clipId: string, noteId: string) => void;
  setPlaying: (v: boolean) => void;
  setRecording: (v: boolean) => void;
  setMetronome: (v: boolean) => void;
  setLoop: (enabled: boolean, startBeat?: number, endBeat?: number) => void;
  setPxPerSec: (v: number) => void;
  setSnapDiv: (v: number) => void;
  setBottomPanel: (p: BottomPanel) => void;
  toggleLeftPanel: () => void;
  toggleMastering: () => void;
  setMasteringOpen: (v: boolean) => void;
  showToast: (msg: string | null) => void;
  undo: () => void;
  redo: () => void;
}

function makeTrack(kind: Track["kind"], instrument: InstrumentId, index: number): Track {
  return {
    id: uid(),
    name: kind === "audio" ? `Audio ${index}` : `${instrument[0].toUpperCase()}${instrument.slice(1)} ${index}`,
    kind,
    instrument,
    color: TRACK_COLORS[index % TRACK_COLORS.length],
    volume: 0.8,
    pan: 0,
    muted: false,
    solo: false,
    armed: false,
    monitor: kind === "audio",
    reverbSend: 0.12,
    delaySend: 0,
    effects: {
      eqLow: 0,
      eqMid: 0,
      eqHigh: 0,
      compress: false,
      drive: 0,
      chorusDepth: 0,
      chorusSpeed: 50,
      delayFeedback: 28,
      delayTime: "1/16 beat",
      delayHp: 50,
      delayLp: 8000,
      stereoSpread: 50,
      reverbMix: 25,
      reverbSize: 50,
      reverbTone: 50,
    },
  };
}

const snap = (s: Store): Snapshot => ({
  name: s.name,
  tempo: s.tempo,
  tracks: JSON.parse(JSON.stringify(s.tracks)),
  clips: JSON.parse(JSON.stringify(s.clips)),
});

export const useStore = create<Store>((set, get) => {
  /** apply a mutation to the project, optionally recording undo history */
  const mutate = (fn: (s: Store) => void, record = true) => {
    set((s) => {
      const draft = { ...s };
      fn(draft);
      if (record) {
        draft.past = [...s.past, snap(s)].slice(-60);
        draft.future = [];
      }
      return draft as Store;
    });
  };

  const audioTrackCount = () => get().tracks.filter((t) => t.kind === "audio").length + 1;
  const instCount = (i: InstrumentId) =>
    get().tracks.filter((t) => t.kind === "instrument" && t.instrument === i).length + 1;

  return {
    name: "Untitled Project",
    tempo: 120,
    tracks: [],
    clips: [],
    isPlaying: false,
    isRecording: false,
    metronome: false,
    loopEnabled: false,
    loopStartBeat: 0,
    loopEndBeat: 8,
    selectedTrackId: null,
    selectedClipId: null,
    pxPerSec: 40,
    snapDiv: 0.25,
    bottomPanel: "fx",
    leftPanelOpen: false,
    masteringOpen: false,
    toast: null,
    past: [],
    future: [],

    toggleMastering: () => set((s) => ({ masteringOpen: !s.masteringOpen })),
    setMasteringOpen: (v) => set({ masteringOpen: v }),

    setProjectName: (name) => set({ name }),
    setTempo: (bpm) => {
      const v = Math.max(40, Math.min(220, Math.round(bpm)));
      engine.bpm = v;
      mutate((s) => {
        s.tempo = v;
      });
    },
    addTrack: (kind, instrument = "piano") => {
      const id = uid();
      mutate((s) => {
        const idx = s.tracks.length;
        const t = makeTrack(kind, kind === "audio" ? "piano" : instrument, idx);
        t.id = id;
        if (kind === "audio") t.name = `Audio ${audioTrackCount()}`;
        else t.name = `${instrument[0].toUpperCase()}${instrument.slice(1)} ${instCount(instrument)}`;
        s.tracks = [...s.tracks, t];
        s.selectedTrackId = t.id;
      });
      engine.syncTracks(get().tracks);
      return id;
    },
    deleteTrack: (id) => {
      mutate((s) => {
        s.tracks = s.tracks.filter((t) => t.id !== id);
        s.clips = s.clips.filter((c) => c.trackId !== id);
        if (s.selectedTrackId === id) s.selectedTrackId = null;
      });
    },
    updateTrack: (id, patch, record = true) => {
      mutate((s) => {
        s.tracks = s.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t));
      }, record);
      engine.syncTracks(get().tracks);
    },
    armOnly: (id) => {
      const t = get().tracks.find((x) => x.id === id);
      mutate((s) => {
        s.tracks = s.tracks.map((x) => ({ ...x, armed: x.id === id ? !t?.armed : false }));
        s.selectedTrackId = id;
      });
      engine.syncTracks(get().tracks);
    },
    duplicateTrack: (id) => {
      mutate((s) => {
        const src = s.tracks.find((t) => t.id === id);
        if (!src) return;
        const copy: Track = { ...JSON.parse(JSON.stringify(src)), id: uid(), name: `${src.name} copy`, armed: false };
        s.tracks = [...s.tracks, copy];
      });
    },
    addLoopClip: (loop, trackId, atSec) => {
      const spb = 60 / get().tempo;
      const id = uid();
      mutate((s) => {
        const clip: Clip = {
          id,
          trackId,
          name: loop.name,
          kind: "midi",
          start: Math.max(0, atSec),
          duration: loop.lengthBeats * spb,
          color: loop.color,
          offset: 0,
          lengthBeats: loop.lengthBeats,
          notes: loop.notes.map(([beat, pitch, dur, vel]) => ({
            id: uid(),
            pitch,
            start: beat,
            duration: dur,
            velocity: vel,
          })),
        };
        s.clips = [...s.clips, clip];
        s.selectedClipId = id;
      });
    },
    addAudioClip: (trackId, bufferId, duration, atSec, name) => {
      const id = uid();
      mutate((s) => {
        const track = s.tracks.find((t) => t.id === trackId);
        const clip: Clip = {
          id,
          trackId,
          name,
          kind: "audio",
          start: Math.max(0, atSec),
          duration,
          color: track?.color ?? "#f2543d",
          offset: 0,
          bufferId,
        };
        s.clips = [...s.clips, clip];
        s.selectedClipId = id;
      });
    },
    deleteClip: (id) => {
      mutate((s) => {
        s.clips = s.clips.filter((c) => c.id !== id);
        if (s.selectedClipId === id) s.selectedClipId = null;
      });
    },
    updateClip: (id, patch, record = true) => {
      mutate((s) => {
        s.clips = s.clips.map((c) => (c.id === id ? { ...c, ...patch } : c));
      }, record);
    },
    getSnapshot: () => snap(get()),
    recordHistory: (prev) =>
      set((s) => ({ past: [...s.past, prev].slice(-60), future: [] })),
    moveClip: (id, startSec) => {
      mutate((s) => {
        s.clips = s.clips.map((c) => (c.id === id ? { ...c, start: Math.max(0, startSec) } : c));
      });
    },
    selectClip: (id) => {
      set({ selectedClipId: id });
      if (id) {
        const clip = get().clips.find((c) => c.id === id);
        if (clip?.kind === "midi") set({ bottomPanel: "piano" });
      }
    },
    selectTrack: (id) => set({ selectedTrackId: id }),
    addNote: (clipId, note) => {
      mutate((s) => {
        s.clips = s.clips.map((c) =>
          c.id === clipId
            ? { ...c, notes: [...(c.notes ?? []), { ...note, id: uid() }] }
            : c,
        );
      });
    },
    updateNote: (clipId, noteId, patch, record = true) => {
      mutate((s) => {
        s.clips = s.clips.map((c) =>
          c.id === clipId
            ? { ...c, notes: (c.notes ?? []).map((n) => (n.id === noteId ? { ...n, ...patch } : n)) }
            : c,
        );
      }, record);
    },
    deleteNote: (clipId, noteId) => {
      mutate((s) => {
        s.clips = s.clips.map((c) =>
          c.id === clipId ? { ...c, notes: (c.notes ?? []).filter((n) => n.id !== noteId) } : c,
        );
      });
    },
    setPlaying: (v) => set({ isPlaying: v }),
    setRecording: (v) => set({ isRecording: v }),
    setMetronome: (v) => {
      engine.metronome = v;
      set({ metronome: v });
    },
    setLoop: (enabled, startBeat, endBeat) => {
      engine.loopEnabled = enabled;
      if (startBeat !== undefined) engine.loopStart = startBeat;
      if (endBeat !== undefined) engine.loopEnd = endBeat;
      set({
        loopEnabled: enabled,
        loopStartBeat: startBeat ?? get().loopStartBeat,
        loopEndBeat: endBeat ?? get().loopEndBeat,
      });
    },
    setPxPerSec: (v) => set({ pxPerSec: Math.max(8, Math.min(320, v)) }),
    setSnapDiv: (v) => set({ snapDiv: v }),
    setBottomPanel: (p) => set({ bottomPanel: p }),
    toggleLeftPanel: () => set((s) => ({ leftPanelOpen: !s.leftPanelOpen })),
    showToast: (msg) => {
      set({ toast: msg });
      if (msg) window.setTimeout(() => set((s) => (s.toast === msg ? { toast: null } : {})), 2600);
    },
    undo: () => {
      const s = get();
      const prev = s.past[s.past.length - 1];
      if (!prev) return;
      set({
        past: s.past.slice(0, -1),
        future: [snap(s), ...s.future].slice(0, 60),
        ...prev,
      });
      engine.syncTracks(get().tracks);
    },
    redo: () => {
      const s = get();
      const next = s.future[0];
      if (!next) return;
      set({
        future: s.future.slice(1),
        past: [...s.past, snap(s)].slice(-60),
        ...next,
      });
      engine.syncTracks(get().tracks);
    },
  };
});

export function snapSeconds(sec: number, tempo: number, div: number): number {
  const spb = 60 / tempo;
  return Math.round(sec / (spb * div)) * spb * div;
}
