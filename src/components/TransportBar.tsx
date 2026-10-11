import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import { engine } from "../audio/engine";
import { playToggle, stopAll, toggleRecord } from "../state/transport";
import type { InstrumentId } from "../types";

function TimeDisplay() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      if (ref.current) {
        const pos = engine.pos;
        const spb = 60 / (useStore.getState().tempo || 120);
        const beat = pos / spb;
        const bar = Math.floor(beat / 4) + 1;
        const beatInBar = Math.floor(beat % 4) + 1;
        const tick = Math.floor((beat % 1) * 4) + 1;
        ref.current.textContent = `${bar}:${beatInBar}:${tick}`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="time-display">
      <span ref={ref}>1:1:1</span>
    </div>
  );
}

const INSTRUMENTS: { id: InstrumentId; label: string; icon: string }[] = [
  { id: "piano", label: "Grand Piano", icon: "P" },
  { id: "bass", label: "Bass", icon: "B" },
  { id: "pluck", label: "Pluck", icon: "Pk" },
  { id: "pad", label: "Pad", icon: "Pd" },
  { id: "lead", label: "Lead", icon: "L" },
  { id: "drums", label: "Drum Kit", icon: "DK" },
];

export function TransportBar() {
  const isPlaying = useStore((s) => s.isPlaying);
  const isRecording = useStore((s) => s.isRecording);
  const metronome = useStore((s) => s.metronome);
  const loopEnabled = useStore((s) => s.loopEnabled);
  const tempo = useStore((s) => s.tempo);
  const snapDiv = useStore((s) => s.snapDiv);
  const pxPerSec = useStore((s) => s.pxPerSec);
  const bottomPanel = useStore((s) => s.bottomPanel);
  const leftPanelOpen = useStore((s) => s.leftPanelOpen);
  const setMetronome = useStore((s) => s.setMetronome);
  const setLoop = useStore((s) => s.setLoop);
  const setTempo = useStore((s) => s.setTempo);
  const setSnapDiv = useStore((s) => s.setSnapDiv);
  const setPxPerSec = useStore((s) => s.setPxPerSec);
  const setBottomPanel = useStore((s) => s.setBottomPanel);
  const toggleLeftPanel = useStore((s) => s.toggleLeftPanel);
  const addTrack = useStore((s) => s.addTrack);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="transport">
      <div className="group">
        <button className="btn primary" onClick={() => setMenuOpen((v) => !v)}>
          + Add Track
        </button>
        {menuOpen && (
          <div
            style={{
              position: "fixed",
              top: 108,
              left: 10,
              background: "var(--panel-2)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: 6,
              zIndex: 30,
              boxShadow: "0 12px 40px rgba(0,0,0,0.55)",
              minWidth: 200,
            }}
          >
            <div
              className="loop-item"
              onClick={() => {
                addTrack("audio");
                setMenuOpen(false);
              }}
            >
              <span style={{ width: 24, textAlign: "center", fontSize: 11, fontWeight: 700 }}>A</span>
              <div>
                <div className="name">Voice / Audio</div>
                <div className="meta">Rekam dari mikrofon</div>
              </div>
            </div>
            {INSTRUMENTS.map((i) => (
              <div
                key={i.id}
                className="loop-item"
                onClick={() => {
                  addTrack("instrument", i.id);
                  setMenuOpen(false);
                }}
              >
                <span style={{ width: 24, textAlign: "center", fontSize: 11, fontWeight: 700 }}>{i.icon}</span>
                <div>
                  <div className="name">{i.label}</div>
                  <div className="meta">Instrument track (MIDI)</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="group">
        <button
          className={`t-btn play ${isPlaying ? "on" : ""}`}
          title="Play / Pause (Space)"
          onClick={playToggle}
        >
          {isPlaying ? "❚❚" : "▶"}
        </button>
        <button className="t-btn" title="Stop (Shift+Space)" onClick={stopAll}>
          ■
        </button>
        <button
          className={`t-btn rec ${isRecording ? "on" : ""}`}
          title="Record (R)"
          onClick={toggleRecord}
        >
          ●
        </button>
        <TimeDisplay />
      </div>

      <div className="group">
        <div className="num-field">
          <span>BPM</span>
          <input
            type="number"
            min={40}
            max={220}
            value={tempo}
            onChange={(e) => setTempo(Number(e.target.value))}
          />
        </div>
        <div className="num-field">
          <span>Key</span>
          <select className="mini" defaultValue="C">
            {["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </div>
        <div className="num-field">
          <span>Time</span>
          <select className="mini" defaultValue="4/4">
            <option>4/4</option>
            <option>3/4</option>
            <option>6/8</option>
          </select>
        </div>
      </div>

      <div className="group">
        <button
          className={`icon-btn ${metronome ? "active" : ""}`}
          style={{ width: 30, height: 30 }}
          title="Metronome"
          onClick={() => setMetronome(!metronome)}
        >
          M
        </button>
        <button
          className={`btn small ${loopEnabled ? "active" : "ghost"}`}
          title="Loop region (double-click ruler to set)"
          onClick={() => setLoop(!loopEnabled)}
        >
          Loop
        </button>
      </div>

      <div className="group">
        <div className="num-field">
          <span>Snap</span>
          <select
            className="mini"
            value={snapDiv}
            onChange={(e) => setSnapDiv(Number(e.target.value))}
          >
            <option value={4}>1/1</option>
            <option value={2}>1/2</option>
            <option value={1}>1/4</option>
            <option value={0.5}>1/8</option>
            <option value={0.25}>1/16</option>
            <option value={0.0001}>Off</option>
          </select>
        </div>
        <button
          className="icon-btn"
          title="Zoom out"
          onClick={() => setPxPerSec(pxPerSec / 1.35)}
        >
          −
        </button>
        <button className="icon-btn" title="Zoom in" onClick={() => setPxPerSec(pxPerSec * 1.35)}>
          +
        </button>
      </div>

      <div style={{ flex: 1 }} />

      <div className="group" style={{ borderRight: "none" }}>
        <button
          className={`btn small ${leftPanelOpen ? "active" : "ghost"}`}
          onClick={toggleLeftPanel}
        >
          Loops
        </button>
        <button
          className={`btn small ${bottomPanel === "fx" ? "active" : "ghost"}`}
          onClick={() => setBottomPanel(bottomPanel === "fx" ? "none" : "fx")}
        >
          Fx
        </button>
        <button
          className={`btn small ${bottomPanel === "mastering" ? "active" : "ghost"}`}
          onClick={() => setBottomPanel(bottomPanel === "mastering" ? "none" : "mastering")}
        >
          Master
        </button>
        <button
          className={`btn small ${bottomPanel === "piano" ? "active" : "ghost"}`}
          onClick={() => setBottomPanel(bottomPanel === "piano" ? "none" : "piano")}
        >
          Piano Roll
        </button>
      </div>
    </div>
  );
}
