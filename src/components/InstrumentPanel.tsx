import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import { engine } from "../audio/engine";
import type { InstrumentId } from "../types";

const INSTRUMENT_OPTIONS: { id: InstrumentId; label: string }[] = [
  { id: "piano", label: "Studio Grand" },
  { id: "pluck", label: "Electric Keys" },
  { id: "pad", label: "Warm Pad" },
  { id: "lead", label: "Analog Lead" },
  { id: "bass", label: "808 Bass" },
  { id: "drums", label: "Drum Kit" },
];

const SCALES = [
  "Major Scale",
  "Minor Scale",
  "Pentatonic Major",
  "Pentatonic Minor",
  "Blues",
  "Dorian",
  "Mixolydian",
];

const KEYS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

// Map physical computer keyboard keys to relative semitones (from base octave)
const KEYBOARD_MAP: Record<string, number> = {
  a: 0, // C
  w: 1, // C#
  s: 2, // D
  e: 3, // D#
  d: 4, // E
  f: 5, // F
  t: 6, // F#
  g: 7, // G
  y: 8, // G#
  h: 9, // A
  u: 10, // A#
  j: 11, // B
  k: 12, // C+1
  o: 13, // C#+1
  l: 14, // D+1
  p: 15, // D#+1
  ";": 16, // E+1
  "'": 17, // F+1
};

export function InstrumentPanel() {
  const selectedTrackId = useStore((s) => s.selectedTrackId);
  const track = useStore((s) => s.tracks.find((t) => t.id === selectedTrackId));
  const updateTrack = useStore((s) => s.updateTrack);
  const setBottomPanel = useStore((s) => s.setBottomPanel);

  const [octave, setOctave] = useState(3);
  const [sustain, setSustain] = useState(false);
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [mode, setMode] = useState<"keyboard" | "smart-keys">("keyboard");
  const [selectedKey, setSelectedKey] = useState("G");
  const [selectedScale, setSelectedScale] = useState("Major Scale");

  const currentInstrument = track?.instrument ?? "piano";
  const instIndex = INSTRUMENT_OPTIONS.findIndex((i) => i.id === currentInstrument);

  const prevInstrument = () => {
    if (!track) return;
    const nextIdx = (instIndex - 1 + INSTRUMENT_OPTIONS.length) % INSTRUMENT_OPTIONS.length;
    updateTrack(track.id, { instrument: INSTRUMENT_OPTIONS[nextIdx].id });
  };

  const nextInstrument = () => {
    if (!track) return;
    const nextIdx = (instIndex + 1) % INSTRUMENT_OPTIONS.length;
    updateTrack(track.id, { instrument: INSTRUMENT_OPTIONS[nextIdx].id });
  };

  const playPitch = (pitch: number) => {
    const dur = sustain ? 1.6 : 0.45;
    engine.audition(track?.instrument ?? "piano", pitch, dur, 0.9);
    setActiveNotes((prev) => new Set([...prev, pitch]));
    setTimeout(() => {
      setActiveNotes((prev) => {
        const next = new Set(prev);
        next.delete(pitch);
        return next;
      });
    }, 240);
  };

  // Keyboard shortcut listener for live playing
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") {
        return;
      }
      const char = e.key.toLowerCase();
      if (char in KEYBOARD_MAP) {
        const semitone = KEYBOARD_MAP[char];
        const pitch = (octave + 1) * 12 + semitone;
        playPitch(pitch);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [octave, sustain, track?.instrument]);

  // Generate piano keys from C(octave) to B(octave+1) + C(octave+2)
  const basePitch = (octave + 1) * 12; // C3 is MIDI 48 when octave=3

  // White keys layout: 15 white keys across 2+ octaves
  // C, D, E, F, G, A, B, C, D, E, F, G, A, B, C
  const whiteKeyOffsets = [
    { st: 0, label: "C", keyChar: "A", octaveMark: `C${octave}` },
    { st: 2, label: "D", keyChar: "S" },
    { st: 4, label: "E", keyChar: "D" },
    { st: 5, label: "F", keyChar: "F" },
    { st: 7, label: "G", keyChar: "G" },
    { st: 9, label: "A", keyChar: "H" },
    { st: 11, label: "B", keyChar: "J" },
    { st: 12, label: "C", keyChar: "K", octaveMark: `C${octave + 1}` },
    { st: 14, label: "D", keyChar: "L" },
    { st: 16, label: "E", keyChar: ":" },
    { st: 17, label: "F", keyChar: "'" },
    { st: 19, label: "G", keyChar: "" },
    { st: 21, label: "A", keyChar: "" },
    { st: 23, label: "B", keyChar: "" },
    { st: 24, label: "C", keyChar: "", octaveMark: `C${octave + 2}` },
  ];

  // Black keys positions relative to white keys index
  const blackKeys = [
    { st: 1, keyChar: "W", whiteIndex: 0 },
    { st: 3, keyChar: "E", whiteIndex: 1 },
    { st: 6, keyChar: "T", whiteIndex: 3 },
    { st: 8, keyChar: "Y", whiteIndex: 4 },
    { st: 10, keyChar: "U", whiteIndex: 5 },
    { st: 13, keyChar: "O", whiteIndex: 7 },
    { st: 15, keyChar: "P", whiteIndex: 8 },
    { st: 18, keyChar: "", whiteIndex: 10 },
    { st: 20, keyChar: "", whiteIndex: 11 },
    { st: 22, keyChar: "", whiteIndex: 12 },
  ];

  return (
    <div className="bottom-panel bandlab-instrument-panel">
      {/* Top Controls Bar */}
      <div className="inst-top-bar">
        <div className="inst-top-left">
          <button
            className="icon-btn-subtle"
            onClick={() => setBottomPanel("none")}
            title="Close Instrument"
          >
            ✕
          </button>
          <div className="inst-track-pill">
            <span className="inst-track-dot" style={{ background: track?.color ?? "var(--accent)" }} />
            <span className="inst-track-name">{track?.name ?? "Melody"}</span>
          </div>

          <div className="inst-selector-card">
            <button className="inst-nav-btn" onClick={prevInstrument}>
              ‹
            </button>
            <span className="inst-title">
              {INSTRUMENT_OPTIONS[instIndex]?.label ?? "Studio Grand"}
            </span>
            <button className="inst-nav-btn" onClick={nextInstrument}>
              ›
            </button>
          </div>
        </div>

        <div className="inst-top-center">
          <div className="inst-pill-toggle">
            <button
              className={`inst-toggle-item ${mode === "keyboard" ? "active" : ""}`}
              onClick={() => setMode("keyboard")}
            >
              Keyboard
            </button>
            <button
              className={`inst-toggle-item ${mode === "smart-keys" ? "active" : ""}`}
              onClick={() => setMode("smart-keys")}
            >
              Smart Keys
            </button>
          </div>

          <div className="inst-octave-control">
            <span className="inst-label">Octave</span>
            <button
              className="octave-btn"
              onClick={() => setOctave((o) => Math.max(1, o - 1))}
            >
              −
            </button>
            <span className="octave-num">{octave}</span>
            <button
              className="octave-btn"
              onClick={() => setOctave((o) => Math.min(6, o + 1))}
            >
              +
            </button>
          </div>

          <button
            className={`inst-sustain-btn ${sustain ? "on" : ""}`}
            onClick={() => setSustain(!sustain)}
          >
            <span className="sustain-dot" />
            Sustain
          </button>
        </div>

        <div className="inst-top-right">
          <div className="inst-scale-picker">
            <span className="inst-label">Scale</span>
            <select
              className="inst-select mini-key"
              value={selectedKey}
              onChange={(e) => setSelectedKey(e.target.value)}
            >
              {KEYS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <select
              className="inst-select"
              value={selectedScale}
              onChange={(e) => setSelectedScale(e.target.value)}
            >
              {SCALES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Piano Keyboard Area */}
      <div className="inst-body-area">
        <div className="piano-keyboard-container">
          <div className="piano-keys-wrapper">
            {/* White Keys */}
            <div className="white-keys-row">
              {whiteKeyOffsets.map((wk, idx) => {
                const pitch = basePitch + wk.st;
                const isActive = activeNotes.has(pitch);
                return (
                  <div
                    key={idx}
                    className={`piano-white-key ${isActive ? "active" : ""}`}
                    onPointerDown={() => playPitch(pitch)}
                  >
                    {wk.octaveMark && (
                      <span className="white-octave-mark">{wk.octaveMark}</span>
                    )}
                    {wk.keyChar && (
                      <span className="white-key-char-badge">{wk.keyChar}</span>
                    )}
                    <span className="white-key-dot" />
                  </div>
                );
              })}
            </div>

            {/* Black Keys overlaid */}
            <div className="black-keys-row">
              {blackKeys.map((bk, idx) => {
                const pitch = basePitch + bk.st;
                const isActive = activeNotes.has(pitch);
                // Position based on white key index (each white key is roughly 100/15 % wide)
                const leftPct = ((bk.whiteIndex + 0.65) / 15) * 100;
                return (
                  <div
                    key={idx}
                    className={`piano-black-key ${isActive ? "active" : ""}`}
                    style={{ left: `${leftPct}%` }}
                    onPointerDown={() => playPitch(pitch)}
                  >
                    {bk.keyChar && (
                      <span className="black-key-char-badge">{bk.keyChar}</span>
                    )}
                    <span className="black-key-dot" />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Side: Smart Chords / Complexity Pad */}
        <div className="inst-smart-pad-card">
          <div className="smart-pad-head">
            <span className="smart-pad-title">Smart Chords</span>
            <span className="smart-pad-info" title="Drag to play harmonic chords">ⓘ</span>
          </div>
          <div className="smart-pad-grid">
            <div className="pad-axis-label v">Complexity</div>
            <div className="pad-axis-label h">Spread</div>
            <div
              className="smart-pad-surface"
              onPointerDown={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
                // Play chords based on X (Spread) and Y (Complexity)
                const root = basePitch + Math.floor(x * 7) * 2;
                const third = root + (y > 0.5 ? 3 : 4);
                const fifth = root + 7;
                const seventh = root + (y > 0.6 ? 10 : 11);
                playPitch(root);
                playPitch(third);
                playPitch(fifth);
                if (y > 0.5) playPitch(seventh);
              }}
            >
              <div className="pad-dots-grid">
                {Array.from({ length: 48 }).map((_, i) => (
                  <span key={i} className="pad-grid-dot" />
                ))}
              </div>
              <div
                className="pad-touch-puck"
                style={{ top: "35%", left: "60%" }}
              />
            </div>
          </div>
          <div className="smart-pad-foot">
            <span className="arpeggiator-label">Touch & Drag to Play</span>
          </div>
        </div>
      </div>
    </div>
  );
}
