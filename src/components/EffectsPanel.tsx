import { useState } from "react";
import { useStore } from "../state/store";
import { engine } from "../audio/engine";
import { RotaryKnob } from "./RotaryKnob";
import { LSP_PLUGINS_CATALOG, LspPluginDef } from "../audio/lspPlugins";

interface EffectUnit {
  id: string;
  name: string;
  enabled: boolean;
  type: "chorus" | "delay" | "stereo" | "reverb" | "compressor" | "generic" | "lsp";
  lspPluginId?: string;
  color?: string;
  params: Record<string, number | string>;
}

const INITIAL_EFFECTS: EffectUnit[] = [
  {
    id: "st-chorus",
    name: "ST Chorus",
    enabled: true,
    type: "chorus",
    params: { depth: 70, speed: 50 },
  },
  {
    id: "d-delay",
    name: "D-Delay +",
    enabled: true,
    type: "delay",
    params: {
      feedback: 28,
      time: "1/16 beat",
      highPass: 50,
      lowPass: 8000,
      spread: 40,
      wet: 35,
      dry: 100,
      volume: 0,
    },
  },
  {
    id: "stereowise",
    name: "Stereowise",
    enabled: true,
    type: "stereo",
    params: { spread: 65, low: 45, high: 60 },
  },
  {
    id: "studio-reverb",
    name: "Studio Reverb",
    enabled: true,
    type: "reverb",
    params: { mix: 42, size: 55, tone: 38 },
  },
];

export function EffectsPanel() {
  const selectedTrackId = useStore((s) => s.selectedTrackId);
  const track = useStore((s) => s.tracks.find((t) => t.id === selectedTrackId));
  const updateTrack = useStore((s) => s.updateTrack);
  const showToast = useStore((s) => s.showToast);
  const setBottomPanel = useStore((s) => s.setBottomPanel);

  const effects = (track?.effectsRack && track.effectsRack.length > 0 ? track.effectsRack : INITIAL_EFFECTS) as EffectUnit[];
  const [blend, setBlend] = useState(100);
  const [bypassAll, setBypassAll] = useState(false);
  const [lspModalOpen, setLspModalOpen] = useState(false);
  const [lspFilterCat, setLspFilterCat] = useState("All");

  const toggleEffect = (id: string) => {
    if (!track) return;
    const target = effects.find((e) => e.id === id);
    if (!target) return;
    const nextEnabled = !target.enabled;
    const next = effects.map((e) => (e.id === id ? { ...e, enabled: nextEnabled } : e));
    updateTrack(track.id, { effectsRack: next });
    if (target.type === "lsp" && target.lspPluginId) {
      engine.setLspBypass(track.id, target.lspPluginId, !nextEnabled);
    }
  };

  const removeEffect = (id: string) => {
    if (!track) return;
    const target = effects.find((e) => e.id === id);
    const next = effects.filter((e) => e.id !== id);
    updateTrack(track.id, { effectsRack: next });
    if (target?.type === "lsp" && target.lspPluginId) {
      engine.setLspBypass(track.id, target.lspPluginId, true);
    }
  };

  const addEffect = () => {
    if (!track) return;
    const pool: { name: string; type: EffectUnit["type"] }[] = [
      { name: "BL 1176 Compressor", type: "compressor" },
      { name: "Graphic EQ", type: "generic" },
      { name: "Overdrive Pro", type: "generic" },
      { name: "Phaser Dimension", type: "chorus" },
    ];
    const available = pool.find((p) => !effects.some((e) => e.name === p.name));
    if (!available) {
      showToast("Rack slots full");
      return;
    }
    const newUnit: EffectUnit = {
      id: `fx-${Date.now()}`,
      name: available.name,
      enabled: true,
      type: available.type,
      params: { level: 50, drive: 40 },
    };
    updateTrack(track.id, { effectsRack: [...effects, newUnit] });
    showToast(`Added ${available.name}`);
  };

  const addLspPlugin = (plugin: LspPluginDef) => {
    if (!track) {
      showToast("Select a track first");
      return;
    }
    const initParams: Record<string, number> = {};
    for (const p of plugin.params) {
      initParams[p.id] = p.defaultValue;
    }
    const newUnit: EffectUnit = {
      id: `lsp-${Date.now()}`,
      name: plugin.name,
      enabled: true,
      type: "lsp",
      lspPluginId: plugin.id,
      color: plugin.color,
      params: initParams,
    };
    const next = [...effects, newUnit];
    updateTrack(track.id, { effectsRack: next });

    // Enable in live DSP engine immediately
    engine.setLspBypass(track.id, plugin.id, false);
    for (const [pId, pVal] of Object.entries(initParams)) {
      engine.updateLspParam(track.id, plugin.id, pId, pVal);
    }

    setLspModalOpen(false);
    showToast(`Added ${plugin.name} (egidf/lsp-plugins) to rack`);
  };

  const updateParam = (unitId: string, param: string, val: number | string) => {
    if (!track) return;
    const target = effects.find((e) => e.id === unitId);
    const next = effects.map((e) =>
      e.id === unitId ? { ...e, params: { ...e.params, [param]: val } } : e
    );
    updateTrack(track.id, { effectsRack: next }, false);

    const num = Number(val);

    // Live DSP update for LSP plugin units
    if (target?.type === "lsp" && target.lspPluginId) {
      engine.updateLspParam(track.id, target.lspPluginId, param, num);
    }

    // Synchronize legacy effects object for engine compatibility
    const curFx = { ...track.effects };
    if (unitId === "st-chorus") {
      if (param === "depth") curFx.chorusDepth = num;
      if (param === "speed") curFx.chorusSpeed = num;
    } else if (unitId === "d-delay") {
      if (param === "wet") {
        updateTrack(track.id, { delaySend: (num / 100) * 0.75 }, false);
      }
      if (param === "feedback") curFx.delayFeedback = num;
      if (param === "highPass") curFx.delayHp = num;
      if (param === "lowPass") curFx.delayLp = num;
      if (param === "time") curFx.delayTime = String(val);
    } else if (unitId === "stereowise") {
      if (param === "spread") curFx.stereoSpread = num;
      if (param === "low") curFx.eqLow = ((num - 50) / 50) * 12;
      if (param === "high") curFx.eqHigh = ((num - 50) / 50) * 12;
    } else if (unitId === "studio-reverb") {
      if (param === "mix" || param === "wet") {
        updateTrack(track.id, { reverbSend: (num / 100) * 0.8 }, false);
        curFx.reverbMix = num;
      }
      if (param === "size") curFx.reverbSize = num;
      if (param === "tone") {
        curFx.reverbTone = num;
        curFx.eqHigh = ((num - 50) / 50) * 8;
      }
    } else if (target?.type === "lsp" && target.lspPluginId === "lsp-para-equalizer") {
      if (param === "lowGain") curFx.eqLow = num;
      if (param === "midGain1" || param === "midGain2") curFx.eqMid = num;
      if (param === "highGain") curFx.eqHigh = num;
    } else if (target?.type === "lsp" && target.lspPluginId === "lsp-clipper") {
      if (param === "drive") curFx.drive = num;
    } else if (target?.type === "lsp" && target.lspPluginId === "lsp-art-delay") {
      if (param === "feedback") curFx.delayFeedback = num;
      if (param === "wet") updateTrack(track.id, { delaySend: (num / 100) * 0.8 }, false);
    } else if (target?.type === "lsp" && target.lspPluginId === "lsp-impulse-reverb") {
      if (param === "wet") updateTrack(track.id, { reverbSend: (num / 100) * 0.8 }, false);
    } else {
      if (param === "drive") curFx.drive = num;
      if (param === "level") updateTrack(track.id, { volume: (num / 50) * 0.8 }, false);
    }
    updateTrack(track.id, { effects: curFx }, false);
  };

  return (
    <div className="bottom-panel bandlab-fx-rack-panel">
      {/* Top Header Bar */}
      <div className="fx-top-bar">
        <div className="fx-head-left">
          <button
            className="icon-btn-subtle"
            onClick={() => setBottomPanel("none")}
            title="Close Effects Rack"
          >
            ✕
          </button>
          <div className="fx-track-badge">
            <span
              className="fx-track-dot"
              style={{ background: track?.color ?? "var(--accent)" }}
            />
            <span className="fx-track-title">{track?.name ?? "01 Melody"}</span>
            <span className="fx-active-count">
              {effects.filter((e) => e.enabled && !bypassAll).length} active
            </span>
          </div>
        </div>

        <div className="fx-head-right">
          <button
            className="btn-lsp-suite-link"
            onClick={() => setBottomPanel("lsp")}
            title="Open Linux Studio Plugins Suite (egidf/lsp-plugins)"
          >
            <span className="lsp-chip">⚡ LSP</span>
            <span>Open in LSP Suite</span>
          </button>
          <button
            className="btn-add-lsp-pill"
            onClick={() => setLspModalOpen(true)}
            title="Add plugin from Linux Studio Plugins library"
          >
            + Add LSP Plugin
          </button>
        </div>
      </div>

      <div className="fx-main-workspace">
        {/* Left Column: Presets Browser & Global Blend */}
        <div className="fx-presets-col">
          <div className="fx-col-heading-row">
            <span className="fx-col-heading">Presets</span>
          </div>

          <div className="fx-preset-card">
            <div className="preset-art-badge">
              <span className="badge-text">velpeise</span>
            </div>
            <div className="preset-name-row">
              <span className="preset-title">Custom</span>
              <span className="preset-arrow">›</span>
            </div>
          </div>

          <div className="preset-actions-row">
            <button
              className="preset-save-btn"
              onClick={() => showToast("Preset saved")}
            >
              Save
            </button>
            <button className="preset-icon-btn" title="Options">
              ⋮
            </button>
            <button
              className={`preset-icon-btn ${bypassAll ? "active-bypass" : ""}`}
              onClick={() => setBypassAll(!bypassAll)}
              title={bypassAll ? "Resume All FX" : "Bypass All FX"}
            >
              ⏻
            </button>
          </div>

          <div className="fx-blend-wrapper">
            <div className="blend-header">
              <span className="crown-mini">👑</span>
              <span className="blend-label">Blend</span>
              <span className="blend-info">ⓘ</span>
              <span className="blend-val">{blend}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={blend}
              onChange={(e) => setBlend(Number(e.target.value))}
              className="blend-slider"
            />
          </div>
        </div>

        {/* Center: Scrollable FX Module Cards */}
        <div className="fx-rack-scroll-area">
          {effects.map((unit) => (
            <div
              key={unit.id}
              className={`fx-module-card ${!unit.enabled || bypassAll ? "bypassed" : ""}`}
            >
              <div className="module-head">
                <label className="switch-toggle" title="Toggle Effect Unit">
                  <input
                    type="checkbox"
                    checked={unit.enabled && !bypassAll}
                    onChange={() => toggleEffect(unit.id)}
                  />
                  <span className="switch-slider" />
                </label>
                <span className="module-info-btn">ⓘ</span>
                <span className="module-title">{unit.name}</span>
                <button
                  className="module-close-btn"
                  onClick={() => removeEffect(unit.id)}
                  title="Remove Module"
                >
                  ✕
                </button>
              </div>

              <div className="module-body">
                {/* 1. ST Chorus */}
                {unit.type === "chorus" && (
                  <div className="pedal-chorus-view">
                    <div className="pedal-center-knob-cluster">
                      <div className="chorus-wave-radar">
                        <div className="wave-ring r1" />
                        <div className="wave-ring r2" />
                        <div className="wave-ring r3" />
                      </div>
                      <RotaryKnob
                        value={Number(unit.params.depth ?? 70)}
                        min={0}
                        max={100}
                        defaultValue={70}
                        size={62}
                        color="#38bdf8"
                        label="Depth"
                        unit="%"
                        onChange={(v) => updateParam(unit.id, "depth", v)}
                      />
                    </div>
                    <div className="pedal-lower-param-row">
                      <RotaryKnob
                        value={Number(unit.params.speed ?? 50)}
                        min={1}
                        max={100}
                        defaultValue={50}
                        size={48}
                        color="#38bdf8"
                        label="Speed"
                        unit="%"
                        onChange={(v) => updateParam(unit.id, "speed", v)}
                      />
                    </div>
                  </div>
                )}

                {/* 2. D-Delay + */}
                {unit.type === "delay" && (
                  <div className="pedal-delay-view">
                    <div className="delay-top-arc-area">
                      <svg viewBox="0 0 120 40" className="delay-arc-svg">
                        <path
                          d="M 10 35 A 50 25 0 0 1 110 35"
                          fill="none"
                          stroke="rgba(255,255,255,0.12)"
                          strokeWidth="2.5"
                        />
                        <path
                          d="M 20 35 A 40 20 0 0 1 100 35"
                          fill="none"
                          stroke="#f97316"
                          strokeWidth="2.5"
                          strokeDasharray="4 3"
                        />
                      </svg>
                      <RotaryKnob
                        value={Number(unit.params.feedback ?? 28)}
                        min={0}
                        max={100}
                        defaultValue={28}
                        size={58}
                        color="#f97316"
                        label="Feedback"
                        unit="%"
                        onChange={(v) => updateParam(unit.id, "feedback", v)}
                      />
                    </div>

                    <div className="delay-params-grid">
                      <div className="param-cell clickable" onClick={() => {
                        const times = ["1/16 beat", "1/8 beat", "1/4 beat", "1/2 beat"];
                        const curr = String(unit.params.time);
                        const next = times[(times.indexOf(curr) + 1) % times.length];
                        updateParam(unit.id, "time", next);
                      }}>
                        <span className="p-title">Time</span>
                        <span className="p-val accent">{String(unit.params.time ?? "1/16 beat")}</span>
                      </div>

                      <div className="param-cell">
                        <RotaryKnob
                          value={Number(unit.params.highPass ?? 50)}
                          min={20}
                          max={500}
                          defaultValue={50}
                          size={44}
                          color="#f97316"
                          label="HP"
                          unit="Hz"
                          onChange={(v) => updateParam(unit.id, "highPass", v)}
                        />
                      </div>

                      <div className="param-cell">
                        <RotaryKnob
                          value={Number(unit.params.lowPass ?? 8000)}
                          min={1000}
                          max={16000}
                          step={100}
                          defaultValue={8000}
                          size={44}
                          color="#f97316"
                          label="LP"
                          unit="Hz"
                          onChange={(v) => updateParam(unit.id, "lowPass", v)}
                        />
                      </div>

                      <div className="param-cell">
                        <RotaryKnob
                          value={Number(unit.params.wet ?? 35)}
                          min={0}
                          max={100}
                          defaultValue={35}
                          size={44}
                          color="#f97316"
                          label="Wet"
                          unit="%"
                          onChange={(v) => updateParam(unit.id, "wet", v)}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. Stereowise */}
                {unit.type === "stereo" && (
                  <div className="pedal-stereowise-view">
                    <div className="stereo-top-knob">
                      <RotaryKnob
                        value={Number(unit.params.spread ?? 65)}
                        min={0}
                        max={100}
                        defaultValue={65}
                        size={62}
                        color="#eab308"
                        label="Spread"
                        unit="%"
                        onChange={(v) => updateParam(unit.id, "spread", v)}
                      />
                    </div>
                    <div className="stereo-lower-knobs-row">
                      <RotaryKnob
                        value={Number(unit.params.low ?? 45)}
                        min={0}
                        max={100}
                        defaultValue={45}
                        size={48}
                        color="#eab308"
                        label="Low"
                        unit="%"
                        onChange={(v) => updateParam(unit.id, "low", v)}
                      />
                      <RotaryKnob
                        value={Number(unit.params.high ?? 60)}
                        min={0}
                        max={100}
                        defaultValue={60}
                        size={48}
                        color="#eab308"
                        label="High"
                        unit="%"
                        onChange={(v) => updateParam(unit.id, "high", v)}
                      />
                    </div>
                  </div>
                )}

                {/* 4. Studio Reverb */}
                {unit.type === "reverb" && (
                  <div className="pedal-reverb-view">
                    <div className="reverb-glow-chamber">
                      <div className="amber-glow-orb" />
                      <RotaryKnob
                        value={Number(unit.params.mix ?? 42)}
                        min={0}
                        max={100}
                        defaultValue={42}
                        size={62}
                        color="#f59e0b"
                        label="Mix"
                        unit="%"
                        onChange={(v) => updateParam(unit.id, "mix", v)}
                      />
                    </div>
                    <div className="reverb-foot-row">
                      <RotaryKnob
                        value={Number(unit.params.size ?? 55)}
                        min={0}
                        max={100}
                        defaultValue={55}
                        size={48}
                        color="#f59e0b"
                        label="Size"
                        unit="%"
                        onChange={(v) => updateParam(unit.id, "size", v)}
                      />
                      <RotaryKnob
                        value={Number(unit.params.tone ?? 38)}
                        min={0}
                        max={100}
                        defaultValue={38}
                        size={48}
                        color="#f59e0b"
                        label="Tone"
                        unit="%"
                        onChange={(v) => updateParam(unit.id, "tone", v)}
                      />
                    </div>
                  </div>
                )}

                {/* 5. Generic or Compressor */}
                {(unit.type === "generic" || unit.type === "compressor") && (
                  <div className="pedal-generic-view">
                    <div className="generic-knobs-row">
                      <RotaryKnob
                        value={Number(unit.params.drive ?? 40)}
                        min={0}
                        max={100}
                        defaultValue={40}
                        size={54}
                        color="#ec4899"
                        label="Drive"
                        unit="%"
                        onChange={(v) => updateParam(unit.id, "drive", v)}
                      />
                      <RotaryKnob
                        value={Number(unit.params.level ?? 50)}
                        min={0}
                        max={100}
                        defaultValue={50}
                        size={54}
                        color="#ec4899"
                        label="Level"
                        unit="%"
                        onChange={(v) => updateParam(unit.id, "level", v)}
                      />
                    </div>
                  </div>
                )}

                {/* 6. LSP Plugin Unit (egidf/lsp-plugins) */}
                {unit.type === "lsp" && (
                  <div className="pedal-lsp-view">
                    <div className="lsp-rack-badge-row">
                      <span className="lsp-rack-tag" style={{ borderColor: unit.color ?? "#38bdf8", color: unit.color ?? "#38bdf8" }}>
                        ⚡ LSP v1.2
                      </span>
                      <a
                        href="https://github.com/egidf/lsp-plugins.git"
                        target="_blank"
                        rel="noreferrer"
                        className="lsp-rack-git-link"
                        onClick={(e) => e.stopPropagation()}
                      >
                        github.com/egidf/lsp-plugins
                      </a>
                    </div>
                    <div className="lsp-rack-knobs-grid">
                      {Object.entries(unit.params).slice(0, 6).map(([paramKey, paramVal]) => (
                        <RotaryKnob
                          key={paramKey}
                          value={Number(paramVal)}
                          min={paramKey.toLowerCase().includes("gain") || paramKey.toLowerCase().includes("thresh") ? -36 : 0}
                          max={paramKey.toLowerCase().includes("gain") ? 18 : paramKey.toLowerCase().includes("thresh") ? 0 : 100}
                          defaultValue={Number(paramVal)}
                          size={52}
                          color={unit.color ?? "#38bdf8"}
                          label={paramKey}
                          unit={paramKey.toLowerCase().includes("gain") || paramKey.toLowerCase().includes("thresh") ? "dB" : "%"}
                          onChange={(newVal) => updateParam(unit.id, paramKey, newVal)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Add Standard Effect Button Card */}
          <div className="fx-add-slot-card" onClick={addEffect} title="Add standard studio pedal">
            <span className="add-plus-symbol">+</span>
            <span className="add-slot-label">Add Effect</span>
          </div>

          {/* Add LSP Plugin Button Card (egidf/lsp-plugins) */}
          <div
            className="fx-add-slot-card lsp-add-card"
            onClick={() => setLspModalOpen(true)}
            title="Browse & insert Linux Studio Plugins (egidf/lsp-plugins)"
          >
            <span className="add-plus-symbol lsp-flash-icon">⚡</span>
            <span className="add-slot-label">Add LSP Plugin</span>
            <span className="lsp-sub-label">Linux Studio Plugins</span>
          </div>
        </div>

        {/* Right Master Output Strip */}
        <div className="fx-master-output-col">
          <span className="master-out-title">Master Output</span>
          <div className="master-vu-ladder">
            {Array.from({ length: 14 }).map((_, i) => (
              <span
                key={i}
                className={`vu-pip ${i < 6 ? "green" : i < 11 ? "yellow" : "red"}`}
              />
            ))}
          </div>

          <div className="master-fader-track">
            <input
              type="range"
              min={0}
              max={1.2}
              step={0.01}
              value={track?.volume ?? 0.8}
              onChange={(e) =>
                track && updateTrack(track.id, { volume: Number(e.target.value) }, false)
              }
              className="master-v-slider"
            />
          </div>
          <span className="master-vol-title">
            {track ? Math.round((track.volume / 1.2) * 100) : 80}%
          </span>

          <div className="master-knobs-duo">
            <RotaryKnob
              value={track?.pan ?? 0}
              min={-1}
              max={1}
              step={0.02}
              defaultValue={0}
              bipolar
              size={46}
              color="#38bdf8"
              label="Pan"
              valueFormat={(v) => (v === 0 ? "C" : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`)}
              onChange={(v) => track && updateTrack(track.id, { pan: v }, false)}
            />

            <RotaryKnob
              value={Math.round((track?.reverbSend ?? 0.1) * 100)}
              min={0}
              max={100}
              defaultValue={10}
              size={46}
              color="#f59e0b"
              label="Reverb"
              unit="%"
              onChange={(v) => track && updateTrack(track.id, { reverbSend: v / 100 }, false)}
            />
          </div>
        </div>
      </div>

      {/* LSP Plugins Modal Selector (egidf/lsp-plugins) */}
      {lspModalOpen && (
        <div className="lsp-picker-modal-overlay" onClick={() => setLspModalOpen(false)}>
          <div className="lsp-picker-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="lsp-picker-head">
              <div className="lsp-picker-title-group">
                <span className="picker-icon">⚡</span>
                <div>
                  <h3>Linux Studio Plugins Library</h3>
                  <a
                    href="https://github.com/egidf/lsp-plugins.git"
                    target="_blank"
                    rel="noreferrer"
                    className="lsp-repo-chip"
                  >
                    egidf/lsp-plugins.git (v1.2.35)
                  </a>
                </div>
              </div>
              <button className="icon-btn-ghost" onClick={() => setLspModalOpen(false)}>
                ✕
              </button>
            </div>

            <div className="lsp-picker-cats">
              {[
                "All",
                "Equalizers",
                "Dynamics",
                "Multiband",
                "Time & Delay",
                "Modulation",
                "Analyzers & Meters",
                "Distortion & Saturation",
              ].map((c) => (
                <button
                  key={c}
                  className={`picker-cat-btn ${lspFilterCat === c ? "active" : ""}`}
                  onClick={() => setLspFilterCat(c)}
                >
                  {c}
                </button>
              ))}
            </div>

            <div className="lsp-picker-grid">
              {LSP_PLUGINS_CATALOG.filter(
                (p) => lspFilterCat === "All" || p.category === lspFilterCat
              ).map((p) => (
                <div key={p.id} className="lsp-picker-card">
                  <div className="picker-card-top">
                    <span className="pcard-icon" style={{ borderColor: p.color }}>
                      {p.icon}
                    </span>
                    <div className="pcard-info">
                      <span className="pcard-title">{p.name}</span>
                      <span className="pcard-cat">{p.category}</span>
                    </div>
                  </div>
                  <p className="pcard-desc">{p.shortDesc}</p>
                  <div className="pcard-actions">
                    <button
                      className="pcard-btn-add"
                      onClick={() => addLspPlugin(p)}
                    >
                      + Add to Rack
                    </button>
                    <button
                      className="pcard-btn-suite"
                      onClick={() => {
                        setLspModalOpen(false);
                        setBottomPanel("lsp");
                      }}
                    >
                      Open in Suite
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
