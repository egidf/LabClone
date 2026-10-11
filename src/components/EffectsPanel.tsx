import { useState } from "react";
import { useStore } from "../state/store";
import { PluginCard, FxParamRow } from "./FxControls";
import type { FxParam } from "./FxControls";

interface PluginState {
  id: string;
  name: string;
  icon: string;
  active: boolean;
  params: Record<string, number | string | boolean>;
}

const DEFAULT_PLUGINS: PluginState[] = [
  {
    id: "multifilter",
    name: "Multi Filter",
    icon: "▽",
    active: true,
    params: { Frequency: 50, Resonance: 30, Gain: 50, Filter: "Lowpass" },
  },
  {
    id: "graphiceq",
    name: "Graphic EQ",
    icon: "▤",
    active: true,
    params: { Level: 50 },
  },
  {
    id: "bl1176",
    name: "BL 1176",
    icon: "◉",
    active: true,
    params: { Input: 50, Output: 50, Attack: 50, Release: 50, Ratio: "12:1" },
  },
  {
    id: "multishifter",
    name: "Multi Shifter",
    icon: "≋",
    active: true,
    params: {
      "Octave Up": 50,
      "Fifth Up": 50,
      "Fourth Up": 50,
      "Octave Down": 50,
      "Fifth Down": 50,
      "Fourth Down": 50,
      Dry: 50,
      "Input Type": "Vocal",
    },
  },
  {
    id: "stchorus",
    name: "ST Chorus",
    icon: "∿",
    active: true,
    params: { Rate: 30, Depth: 50, Mix: 50, Speed: 50 },
  },
];

const FILTER_OPTIONS = ["Lowpass", "Highpass", "Bandpass", "Notch"];
const RATIO_OPTIONS = ["4:1", "8:1", "12:1", "20:1"];
const INPUT_OPTIONS = ["Vocal", "Instrument", "Full Mix", "Bass", "Drums"];

export function EffectsPanel() {
  const selectedTrackId = useStore((s) => s.selectedTrackId);
  const trackName = useStore((s) => {
    const t = s.tracks.find((x) => x.id === s.selectedTrackId);
    return t?.name ?? null;
  });
  const [plugins, setPlugins] = useState<PluginState[]>(DEFAULT_PLUGINS);

  const updatePlugin = (pluginId: string, paramKey: string, value: number | string | boolean) => {
    setPlugins((prev) =>
      prev.map((p) =>
        p.id === pluginId
          ? { ...p, params: { ...p.params, [paramKey]: value } }
          : p,
      ),
    );
  };

  const togglePlugin = (pluginId: string) => {
    setPlugins((prev) =>
      prev.map((p) => (p.id === pluginId ? { ...p, active: !p.active } : p)),
    );
  };

  const removePlugin = (pluginId: string) => {
    setPlugins((prev) => prev.filter((p) => p.id !== pluginId));
  };

  const addPlugin = () => {
    const available = ["Reverb", "Delay", "Chorus", "Flanger", "Phaser", "Distortion", "Tremolo", "Auto-Wah"];
    const next = available.find(
      (n) => !plugins.some((p) => p.name === n),
    );
    if (!next) return;
    setPlugins((prev) => [
      ...prev,
      {
        id: next.toLowerCase().replace(/\s/g, "-"),
        name: next,
        icon: "◇",
        active: true,
        params: { Mix: 50, Level: 50 },
      },
    ]);
  };

  const getParams = (plugin: PluginState): FxParam[] => {
    const p = plugin.params;
    switch (plugin.id) {
      case "multifilter":
        return [
          { knob: { label: "Frequency", value: p.Frequency as number, min: 0, max: 100 } },
          { knob: { label: "Resonance", value: p.Resonance as number, min: 0, max: 100 } },
          { knob: { label: "Gain", value: p.Gain as number, min: 0, max: 100 } },
          { dropdown: { label: "Filter", value: p.Filter as string, options: FILTER_OPTIONS } },
        ];
      case "graphiceq":
        return [
          { fader: { label: "100", value: 0, min: -15, max: 15 } },
          { fader: { label: "200", value: 0, min: -15, max: 15 } },
          { fader: { label: "400", value: 0, min: -15, max: 15 } },
          { fader: { label: "800", value: 0, min: -15, max: 15 } },
          { fader: { label: "1.6k", value: 0, min: -15, max: 15 } },
          { fader: { label: "3.2k", value: 0, min: -15, max: 15 } },
          { fader: { label: "6.4k", value: 0, min: -15, max: 15 } },
          { fader: { label: "Level", value: p.Level as number, min: 0, max: 100 } },
        ];
      case "bl1176":
        return [
          { knob: { label: "Input", value: p.Input as number, min: 0, max: 100 } },
          { knob: { label: "Output", value: p.Output as number, min: 0, max: 100 } },
          { knob: { label: "Attack", value: p.Attack as number, min: 0, max: 100 } },
          { knob: { label: "Release", value: p.Release as number, min: 0, max: 100 } },
          { dropdown: { label: "Ratio", value: p.Ratio as string, options: RATIO_OPTIONS } },
        ];
      case "multishifter":
        return [
          { knob: { label: "Octave Up", value: p["Octave Up"] as number, min: 0, max: 100 } },
          { knob: { label: "Fifth Up", value: p["Fifth Up"] as number, min: 0, max: 100 } },
          { knob: { label: "Fourth Up", value: p["Fourth Up"] as number, min: 0, max: 100 } },
          { knob: { label: "Dry", value: p.Dry as number, min: 0, max: 100 } },
          { knob: { label: "Octave Down", value: p["Octave Down"] as number, min: 0, max: 100 } },
          { knob: { label: "Fifth Down", value: p["Fifth Down"] as number, min: 0, max: 100 } },
          { knob: { label: "Fourth Down", value: p["Fourth Down"] as number, min: 0, max: 100 } },
          { dropdown: { label: "Input Type", value: p["Input Type"] as string, options: INPUT_OPTIONS } },
        ];
      case "stchorus":
        return [
          { knob: { label: "Rate", value: p.Rate as number, min: 0, max: 100 } },
          { knob: { label: "Depth", value: p.Depth as number, min: 0, max: 100 } },
          { knob: { label: "Mix", value: p.Mix as number, min: 0, max: 100 } },
          { knob: { label: "Speed", value: p.Speed as number, min: 0, max: 100 } },
        ];
      default:
        return [
          { knob: { label: "Mix", value: p.Mix as number, min: 0, max: 100 } },
          { knob: { label: "Level", value: p.Level as number, min: 0, max: 100 } },
        ];
    }
  };

  // Always render the panel structure
  return (
    <div className="bottom-panel">
      <div className="bottom-head">
        <h3>Effects</h3>
        <span style={{ color: "var(--muted)", fontSize: 10 }}>
          {trackName ? `${trackName} — ${plugins.filter((p) => p.active).length} active` : "Pilih track untuk mengatur effects"}
        </span>
        <span style={{ flex: 1 }} />
        <button className="add-fx-btn" style={{ margin: 0, padding: "4px 10px" }} onClick={addPlugin}>
          + Add FX
        </button>
      </div>
      <div className="fx-rack">
        {plugins.map((plugin) => (
          <PluginCard
            key={plugin.id}
            name={plugin.name}
            icon={plugin.icon}
            active={plugin.active}
            onToggle={() => togglePlugin(plugin.id)}
            onClose={() => removePlugin(plugin.id)}
          >
            {plugin.id === "graphiceq" ? (
              <div>
                <div className="fx-eq-faders">
                  {getParams(plugin).map((param, i) => (
                    <div key={i} className="fx-fader-cell">
                      <input
                        type="range"
                        min={param.fader?.min ?? -15}
                        max={param.fader?.max ?? 15}
                        step={0.5}
                        value={param.fader?.value ?? 0}
                        onChange={(e) => updatePlugin(plugin.id, param.fader?.label ?? "", Number(e.target.value))}
                        style={{
                          width: 14,
                          height: 70,
                          WebkitAppearance: "slider-vertical",
                          writingMode: "vertical-lr",
                          direction: "rtl",
                          background: "transparent",
                          cursor: "pointer",
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div className="fx-eq-labels">
                  {(getParams(plugin) as { fader?: { label: string } }[]).map((param, i) => (
                    <span key={i}>{param.fader?.label}</span>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div className="fx-knobs-row">
                  {getParams(plugin).map((param, i) => (
                    <FxParamRow key={i} param={param} onChange={(k, v) => updatePlugin(plugin.id, k, v)} />
                  ))}
                </div>
              </>
            )}
          </PluginCard>
        ))}
      </div>
    </div>
  );
}
