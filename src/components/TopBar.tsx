import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import { engine } from "../audio/engine";
import { encodeWav } from "../audio/wav";
import { playToggle, stopAll, toggleRecord, currentProjectLengthSec } from "../state/transport";
import type { Clip, InstrumentId, Track } from "../types";

interface ProjectFile {
  format: "labclone-project";
  version: 1;
  name: string;
  tempo: number;
  tracks: Track[];
  clips: Clip[];
}

function TimeCounter() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      if (ref.current) {
        const pos = engine.pos;
        const minutes = Math.floor(pos / 60);
        const seconds = Math.floor(pos % 60);
        const tenths = Math.floor((pos % 1) * 10);
        ref.current.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <span ref={ref} className="digital-counter">00:00.0</span>;
}

export function TopBar() {
  const name = useStore((s) => s.name);
  const setProjectName = useStore((s) => s.setProjectName);
  const tempo = useStore((s) => s.tempo);
  const setTempo = useStore((s) => s.setTempo);
  const isPlaying = useStore((s) => s.isPlaying);
  const isRecording = useStore((s) => s.isRecording);
  const metronome = useStore((s) => s.metronome);
  const setMetronome = useStore((s) => s.setMetronome);
  const loopEnabled = useStore((s) => s.loopEnabled);
  const setLoop = useStore((s) => s.setLoop);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const bottomPanel = useStore((s) => s.bottomPanel);
  const setBottomPanel = useStore((s) => s.setBottomPanel);
  const masteringOpen = useStore((s) => s.masteringOpen);
  const toggleMastering = useStore((s) => s.toggleMastering);
  const showToast = useStore((s) => s.showToast);

  const [masterVolume, setMasterVolume] = useState(-3.0);
  const [selectedKey, setSelectedKey] = useState("G maj");
  const [timeSignature, setTimeSignature] = useState("4 / 4");
  const [bpmInput, setBpmInput] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const exportWav = async () => {
    const s = useStore.getState();
    const total = currentProjectLengthSec();
    if (total < 0.1) {
      showToast("Project is empty — add clips first");
      return;
    }
    showToast("Rendering mixdown…");
    try {
      const buf = await engine.renderProject(s.tracks, s.clips, s.tempo, total);
      const blob = encodeWav(buf);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${(s.name || "project").replace(/[^\w\- ]+/g, "")}.wav`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      showToast("Export WAV successful");
    } catch {
      showToast("Export failed");
    }
  };

  const saveProject = () => {
    const s = useStore.getState();
    const data: ProjectFile = {
      format: "labclone-project",
      version: 1,
      name: s.name,
      tempo: s.tempo,
      tracks: s.tracks,
      clips: s.clips,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(s.name || "project").replace(/[^\w\- ]+/g, "")}.bandlab.json`;
    a.click();
    showToast("Project saved locally");
  };

  const openProject = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as ProjectFile;
      if (data.format !== "labclone-project") throw new Error("bad format");
      const clips = data.clips.filter((c) => c.kind !== "audio" || engine.buffers.has(c.bufferId ?? ""));
      useStore.setState({
        name: data.name,
        tempo: data.tempo,
        tracks: data.tracks,
        clips,
        past: [],
        future: [],
        selectedClipId: null,
        selectedTrackId: null,
      });
      engine.bpm = data.tempo;
      engine.syncTracks(data.tracks);
      showToast("Project loaded");
    } catch {
      showToast("Invalid project file");
    }
  };

  const toggleKeyboard = () => {
    if (bottomPanel === "instrument") {
      setBottomPanel("none");
    } else {
      setBottomPanel("instrument");
    }
  };

  return (
    <div className="bandlab-topbar">
      {/* Upper center title row */}
      <div className="topbar-center-title-bar">
        <input
          className="topbar-project-title-input"
          value={name}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder="Mouse Trap - Bright - Oct 11, 2026, 2:27 AM"
        />
      </div>

      {/* Main unified navigation & transport strip */}
      <div className="topbar-main-row">
        {/* Left Section: Logo, Pro Badge, Undo/Redo, Virtual Keyboard */}
        <div className="topbar-left-cluster">
          <div className="bandlab-logo-pill">
            <svg className="flame-icon" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2C8.5 7 6 10.5 6 14.5a6 6 0 0 0 12 0c0-4-2.5-7.5-6-12.5z"
                fill="#f2543d"
              />
              <path
                d="M12 11c-1.5 2-2.5 3.5-2.5 5.5a2.5 2.5 0 0 0 5 0c0-2-1-3.5-2.5-5.5z"
                fill="#ffa344"
              />
            </svg>
            <span className="bandlab-brand-text">BandLab</span>
          </div>

          <div className="bandlab-get-pill" onClick={() => showToast("BandLab Membership Active")}>
            <span>Get</span>
            <span className="pro-crown">👑</span>
          </div>

          <div className="undo-redo-group">
            <button
              className="topbar-action-icon"
              title="Undo (Ctrl+Z)"
              onClick={undo}
              style={{ opacity: canUndo ? 1 : 0.35 }}
            >
              ↩
            </button>
            <button
              className="topbar-action-icon"
              title="Redo (Ctrl+Y)"
              onClick={redo}
              style={{ opacity: canRedo ? 1 : 0.35 }}
            >
              ↪
            </button>
          </div>

          <button
            className={`topbar-keyboard-btn ${bottomPanel === "instrument" ? "active" : ""}`}
            title="Virtual Instrument Keyboard"
            onClick={toggleKeyboard}
          >
            🎹
          </button>
        </div>

        {/* Center Section: Metronome, Tempo, Key, Transport Controls, Timer */}
        <div className="topbar-transport-cluster">
          {/* Metronome & Project Parameters */}
          <div className="transport-musical-params">
            <button
              className={`param-icon-btn ${metronome ? "active" : ""}`}
              onClick={() => setMetronome(!metronome)}
              title="Metronome"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 4 22 20 22 12 2" />
                <line x1="12" y1="9" x2="18" y2="15" strokeWidth="2.5" />
              </svg>
              <span className="subtle-chevron">∨</span>
            </button>

            <div className="tempo-box">
              {bpmInput ? (
                <input
                  type="number"
                  autoFocus
                  min={40}
                  max={240}
                  value={tempo}
                  onBlur={() => setBpmInput(false)}
                  onChange={(e) => setTempo(Number(e.target.value))}
                  className="tempo-input"
                />
              ) : (
                <span className="tempo-text" onClick={() => setBpmInput(true)}>
                  <strong>{tempo}</strong> bpm
                </span>
              )}
            </div>

            <div className="timesig-box">
              <span>{timeSignature}</span>
            </div>

            <div className="keysig-box">
              <select
                className="keysig-select"
                value={selectedKey}
                onChange={(e) => setSelectedKey(e.target.value)}
              >
                {["C maj", "D maj", "E maj", "F maj", "G maj", "A min", "C min", "E min"].map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Transport Buttons: Rewind, Play, Record, Loop */}
          <div className="transport-buttons-group">
            <button
              className="trans-btn"
              title="Return to Zero (Shift+Space)"
              onClick={stopAll}
            >
              ⏮
            </button>
            <button
              className={`trans-btn play-circle ${isPlaying ? "playing" : ""}`}
              title="Play / Pause (Space)"
              onClick={playToggle}
            >
              {isPlaying ? "❚❚" : "▶"}
            </button>
            <button
              className={`trans-btn rec-circle ${isRecording ? "recording" : ""}`}
              title="Record (R)"
              onClick={() => void toggleRecord()}
            >
              <span className="rec-dot" />
            </button>
            <button
              className={`trans-btn ${loopEnabled ? "loop-active" : ""}`}
              title="Cycle Loop"
              onClick={() => setLoop(!loopEnabled)}
            >
              🔁
            </button>
          </div>

          {/* Digital Time Position Display */}
          <div className="transport-time-capsule">
            <TimeCounter />
          </div>
        </div>

        {/* Right Section: Mastering Widget, Volume Slider, Save, Publish */}
        <div className="topbar-right-cluster">
          {/* Mastering Widget Button */}
          <div
            className={`mastering-pill-widget ${masteringOpen ? "active" : ""}`}
            onClick={toggleMastering}
            title="Toggle Mastering Suite"
          >
            <span className="mastering-icon">🎛️</span>
            <div className="mastering-texts">
              <span className="m-title">Mastering</span>
              <span className="m-sub">Select Preset ›</span>
            </div>
          </div>

          {/* Master Volume Bar */}
          <div className="master-vol-container">
            <span className="speaker-icon">🔊</span>
            <input
              type="range"
              min={-18}
              max={3}
              step={0.5}
              value={masterVolume}
              onChange={(e) => {
                const val = Number(e.target.value);
                setMasterVolume(val);
                engine.setMasterGain(val);
              }}
              className="master-vol-range"
            />
            <span className="db-readout">{masterVolume.toFixed(1)} dB</span>
          </div>

          <span className="last-saved-label">Last Saved Never</span>

          <button className="btn-outline-save" onClick={saveProject} title="Save Project">
            💾 Save
          </button>

          <button className="btn-publish-white" onClick={() => void exportWav()} title="Export WAV">
            Publish
          </button>

          <button
            className="btn-ghost-small"
            onClick={() => fileRef.current?.click()}
            title="Open Local Project"
          >
            Open
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void openProject(f);
              e.target.value = "";
            }}
          />

          <button className="btn-invite" onClick={() => showToast("Collaboration link copied")}>
            Invite
          </button>

          <div className="notification-bell" onClick={() => showToast("3 updates available")}>
            <span>🔔</span>
            <span className="bell-badge">3</span>
          </div>
        </div>
      </div>
    </div>
  );
}
