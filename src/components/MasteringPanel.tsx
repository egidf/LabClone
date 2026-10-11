import { useState } from "react";
import { useStore } from "../state/store";
import { Knob } from "./FxControls";

interface Preset {
  id: string;
  name: string;
  icon: string;
  color: string;
}

const PRESETS: Preset[] = [
  { id: "universal", name: "Universal", icon: "♪", color: "#a86dfd" },
  { id: "fire", name: "Fire", icon: "🔥", color: "#f2543d" },
  { id: "clarity", name: "Clarity", icon: "◆", color: "#3d8bfd" },
  { id: "tape", name: "Tape", icon: "▣", color: "#f7b32b" },
  { id: "natural", name: "Natural", icon: "❀", color: "#26c281" },
  { id: "spatial", name: "Spatial", icon: "◎", color: "#22d3ee" },
  { id: "cinematic", name: "Cinematic", icon: "🎬", color: "#8a93a5" },
  { id: "punch", name: "Punch", icon: "✦", color: "#ff7bac" },
];

export function MasteringPanel() {
  const showToast = useStore((s) => s.showToast);
  const [selectedPreset, setSelectedPreset] = useState("universal");
  const [intensity, setIntensity] = useState(50);
  const [eqEnabled, setEqEnabled] = useState(true);
  const [low, setLow] = useState(50);
  const [mid, setMid] = useState(50);
  const [high, setHigh] = useState(50);

  const activePreset = PRESETS.find((p) => p.id === selectedPreset);

  return (
    <div className="bottom-panel mastering-panel">
      <div className="mastering-header">
        <div className="mastering-title">
          <span className="mastering-speaker">🔊</span>
          <h3>Mastering</h3>
        </div>
        <button
          className="icon-btn"
          onClick={() => useStore.getState().setBottomPanel("none")}
          title="Close"
        >
          ✕
        </button>
      </div>

      <div className="mastering-body">
        {/* Reference Matching */}
        <div className="mastering-section">
          <div className="mastering-section-header">
            <div>
              <span className="mastering-section-title">
                Reference Matching
                <span className="beta-badge">BETA</span>
              </span>
              <p className="mastering-section-desc">
                Import and analyze any song to match its sound
              </p>
            </div>
            <div className="reference-pro">
              <span className="crown">👑</span>
              <span className="plus-icon">+</span>
            </div>
          </div>
        </div>

        {/* Preset Grid */}
        <div className="mastering-section">
          <div className="preset-grid">
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                className={`preset-card ${selectedPreset === preset.id ? "active" : ""}`}
                style={
                  selectedPreset === preset.id
                    ? { borderColor: preset.color, boxShadow: `0 0 12px ${preset.color}40` }
                    : undefined
                }
                onClick={() => setSelectedPreset(preset.id)}
              >
                <span className="preset-icon" style={{ color: preset.color }}>
                  {preset.icon}
                </span>
                <span className="preset-name">{preset.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Intensity */}
        <div className="mastering-section">
          <div className="intensity-header">
            <span className="mastering-section-title">Intensity</span>
          </div>
          <div className="intensity-slider">
            <span className="intensity-label">Light</span>
            <input
              type="range"
              min={0}
              max={100}
              value={intensity}
              onChange={(e) => setIntensity(Number(e.target.value))}
              className="intensity-range"
            />
            <span className="intensity-label">Heavy</span>
          </div>
          <div className="intensity-marks">
            {[0, 25, 50, 75, 100].map((mark) => (
              <span key={mark} className="intensity-mark" />
            ))}
          </div>
        </div>

        {/* EQ */}
        <div className="mastering-section">
          <div className="mastering-section-header">
            <div className="mastering-section-title">
              EQ
              <span className="beta-badge">BETA</span>
            </div>
            <button
              className={`fx-toggle ${eqEnabled ? "on" : ""}`}
              onClick={() => setEqEnabled(!eqEnabled)}
            >
              {eqEnabled ? "ON" : "OFF"}
            </button>
          </div>
          <div className="eq-knobs" style={{ opacity: eqEnabled ? 1 : 0.4 }}>
            <Knob value={low} label="Low" onChange={setLow} size={52} color="var(--accent)" />
            <Knob value={mid} label="Mid" onChange={setMid} size={52} color="var(--accent)" />
            <Knob value={high} label="High" onChange={setHigh} size={52} color="var(--accent)" />
          </div>
        </div>

        {/* Apply */}
        <div className="mastering-section">
          <button className="apply-btn" onClick={() => showToast(`Mastering "${activePreset?.name}" applied`)}>
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
