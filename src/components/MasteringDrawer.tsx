import { useState } from "react";
import { useStore } from "../state/store";
import { RotaryKnob } from "./RotaryKnob";

interface Preset {
  id: string;
  name: string;
  icon: string;
  color: string;
}

const PRESETS: Preset[] = [
  { id: "universal", name: "Universal", icon: "🎵", color: "#a855f7" },
  { id: "fire", name: "Fire", icon: "🔥", color: "#f97316" },
  { id: "clarity", name: "Clarity", icon: "💎", color: "#38bdf8" },
  { id: "tape", name: "Tape", icon: "📼", color: "#eab308" },
  { id: "natural", name: "Natural", icon: "🌿", color: "#10b981" },
  { id: "spatial", name: "Spatial", icon: "🌀", color: "#06b6d4" },
  { id: "cinematic", name: "Cinematic", icon: "🎬", color: "#f59e0b" },
  { id: "punch", name: "Punch", icon: "💥", color: "#ec4899" },
];

export function MasteringDrawer() {
  const setMasteringOpen = useStore((s) => s.setMasteringOpen);
  const showToast = useStore((s) => s.showToast);

  const [selectedPreset, setSelectedPreset] = useState("universal");
  const [intensity, setIntensity] = useState(50);
  const [eqEnabled, setEqEnabled] = useState(true);
  const [low, setLow] = useState(50);
  const [mid, setMid] = useState(50);
  const [high, setHigh] = useState(50);

  const activePreset = PRESETS.find((p) => p.id === selectedPreset);

  return (
    <div className="bandlab-mastering-drawer">
      {/* Header */}
      <div className="mastering-drawer-head">
        <div className="drawer-title-group">
          <h3>Mastering</h3>
        </div>
        <div className="drawer-head-actions">
          <button className="icon-btn-ghost" title="Mute/Speaker">
            🔊
          </button>
          <button
            className="icon-btn-ghost"
            onClick={() => setMasteringOpen(false)}
            title="Close Drawer"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="mastering-drawer-body">
        {/* Reference Matching Card */}
        <div className="ref-matching-card">
          <div className="ref-text-col">
            <div className="ref-title-row">
              <span className="ref-title">Reference Matching</span>
              <span className="beta-pill">Beta</span>
            </div>
            <p className="ref-subtitle">
              Import and analyze any song to match its sound
            </p>
          </div>
          <div className="ref-pro-badge">
            <span className="crown-icon">👑</span>
            <span className="plus-symbol">+</span>
          </div>
        </div>

        {/* 8 Presets in 2-column grid */}
        <div className="mastering-preset-grid">
          {PRESETS.map((p) => {
            const isSelected = selectedPreset === p.id;
            return (
              <button
                key={p.id}
                className={`mastering-preset-tile ${isSelected ? "selected" : ""}`}
                style={
                  isSelected
                    ? {
                        borderColor: p.color,
                        boxShadow: `0 0 14px ${p.color}35`,
                      }
                    : undefined
                }
                onClick={() => setSelectedPreset(p.id)}
              >
                <span className="tile-icon" style={{ color: p.color }}>
                  {p.icon}
                </span>
                <span className="tile-name">{p.name}</span>
              </button>
            );
          })}
        </div>

        {/* Intensity */}
        <div className="mastering-param-card">
          <div className="param-card-header">
            <span className="param-card-title">Intensity</span>
          </div>
          <div className="intensity-track-wrapper">
            <div className="intensity-markers">
              <span className="int-label">Light</span>
              <span className="int-label">Normal</span>
              <span className="int-label">Heavy</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={intensity}
              onChange={(e) => setIntensity(Number(e.target.value))}
              className="intensity-fader"
            />
            <div className="intensity-notches">
              {[0, 25, 50, 75, 100].map((mark) => (
                <span key={mark} className="notch-line" />
              ))}
            </div>
          </div>
        </div>

        {/* EQ Section */}
        <div className="mastering-param-card">
          <div className="param-card-header">
            <div className="eq-label-group">
              <span className="param-card-title">EQ</span>
              <span className="beta-pill">Beta</span>
            </div>
            <label className="switch-toggle mini">
              <input
                type="checkbox"
                checked={eqEnabled}
                onChange={() => setEqEnabled(!eqEnabled)}
              />
              <span className="switch-slider" />
            </label>
          </div>

          <div className="mastering-eq-knobs-row" style={{ opacity: eqEnabled ? 1 : 0.35 }}>
            <RotaryKnob
              value={low}
              min={-12}
              max={12}
              step={0.5}
              defaultValue={0}
              bipolar
              size={44}
              color="#a855f7"
              label="Low"
              unit="dB"
              onChange={setLow}
            />

            <RotaryKnob
              value={mid}
              min={-12}
              max={12}
              step={0.5}
              defaultValue={0}
              bipolar
              size={44}
              color="#a855f7"
              label="Mid"
              unit="dB"
              onChange={setMid}
            />

            <RotaryKnob
              value={high}
              min={-12}
              max={12}
              step={0.5}
              defaultValue={0}
              bipolar
              size={44}
              color="#a855f7"
              label="High"
              unit="dB"
              onChange={setHigh}
            />
          </div>
        </div>

        {/* Apply CTA Button */}
        <div className="mastering-apply-container">
          <button
            className="mastering-apply-cta"
            onClick={() => {
              showToast(`Mastering applied: ${activePreset?.name ?? "Universal"}`);
              setMasteringOpen(false);
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
