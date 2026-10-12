import { useEffect, useRef, useState } from "react";
import {
  LSP_PLUGINS_CATALOG,
  LspCategory,
} from "../audio/lspPlugins";
import { useStore } from "../state/store";
import { engine } from "../audio/engine";
import { RotaryKnob } from "./RotaryKnob";
import type { RackUnit } from "../types";

export function LspPluginsSuite() {
  const tracks = useStore((s) => s.tracks);
  const selectedTrackId = useStore((s) => s.selectedTrackId);
  const track = useStore((s) => s.tracks.find((t) => t.id === selectedTrackId) ?? s.tracks[0]);
  const updateTrack = useStore((s) => s.updateTrack);
  const setBottomPanel = useStore((s) => s.setBottomPanel);
  const showToast = useStore((s) => s.showToast);

  const [activeCategory, setActiveCategory] = useState<LspCategory | "All">("All");
  const [selectedPluginId, setSelectedPluginId] = useState<string>("lsp-para-equalizer");
  const [searchQuery, setSearchQuery] = useState("");
  const [targetDestination, setTargetDestination] = useState<string>(track?.id ?? "master");
  const [bypass, setBypass] = useState(false);
  const [auditionType, setAuditionType] = useState<"synth" | "drums" | "bass" | "noise" | null>(null);

  // Per-plugin parameter states
  const [pluginParams, setPluginParams] = useState<Record<string, Record<string, number>>>(() => {
    const init: Record<string, Record<string, number>> = {};
    for (const p of LSP_PLUGINS_CATALOG) {
      init[p.id] = {};
      for (const param of p.params) {
        init[p.id][param.id] = param.defaultValue;
      }
    }
    return init;
  });

  const activePlugin =
    LSP_PLUGINS_CATALOG.find((p) => p.id === selectedPluginId) ?? LSP_PLUGINS_CATALOG[0];

  // Canvas visualizer refs
  const spectrumCanvasRef = useRef<HTMLCanvasElement>(null);
  const oscCanvasRef = useRef<HTMLCanvasElement>(null);
  const gonioCanvasRef = useRef<HTMLCanvasElement>(null);
  const grMeterRef = useRef<HTMLDivElement>(null);
  const mbMetersRef = useRef<(HTMLDivElement | null)[]>([]);

  // Stop audition audio on unmount
  useEffect(() => {
    return () => {
      engine.stopAudition();
    };
  }, []);

  // Update target destination when selectedTrackId changes if not set to master
  useEffect(() => {
    if (selectedTrackId && targetDestination !== "master") {
      setTargetDestination(selectedTrackId);
    }
  }, [selectedTrackId]);

  // Live parameter changes with Web Audio engine and track state
  const handleParamChange = (paramId: string, val: number) => {
    setPluginParams((prev) => ({
      ...prev,
      [activePlugin.id]: {
        ...prev[activePlugin.id],
        [paramId]: val,
      },
    }));

    // Real-time DSP parameter update
    engine.updateLspParam(targetDestination, activePlugin.id, paramId, val);

    // Sync with track state if target is a track
    if (track && targetDestination === track.id) {
      if (track.effectsRack) {
        const updatedRack = track.effectsRack.map((u) => {
          if (u.type === "lsp" && u.lspPluginId === activePlugin.id) {
            return {
              ...u,
              params: {
                ...u.params,
                [paramId]: val,
              },
            };
          }
          return u;
        });
        updateTrack(track.id, { effectsRack: updatedRack }, false);
      }

      // Sync legacy properties
      const curFx = { ...track.effects };
      if (activePlugin.id === "lsp-para-equalizer") {
        if (paramId === "lowGain") curFx.eqLow = val;
        if (paramId === "midGain1" || paramId === "midGain2") curFx.eqMid = val;
        if (paramId === "highGain") curFx.eqHigh = val;
      } else if (activePlugin.id === "lsp-compressor") {
        curFx.compress = !bypass;
      } else if (activePlugin.id === "lsp-art-delay") {
        if (paramId === "feedback") curFx.delayFeedback = val;
        if (paramId === "wet") updateTrack(track.id, { delaySend: (val / 100) * 0.8 }, false);
      } else if (activePlugin.id === "lsp-chorus") {
        if (paramId === "depth") curFx.chorusDepth = val;
      } else if (activePlugin.id === "lsp-clipper") {
        if (paramId === "drive") curFx.drive = val;
      } else if (activePlugin.id === "lsp-impulse-reverb") {
        if (paramId === "wet") updateTrack(track.id, { reverbSend: (val / 100) * 0.8 }, false);
      }
      updateTrack(track.id, { effects: curFx }, false);
    }
  };

  const handleBypassToggle = () => {
    const nextBypass = !bypass;
    setBypass(nextBypass);
    engine.setLspBypass(targetDestination, activePlugin.id, nextBypass);

    if (track && targetDestination === track.id && track.effectsRack) {
      const updatedRack = track.effectsRack.map((u) =>
        u.type === "lsp" && u.lspPluginId === activePlugin.id ? { ...u, enabled: !nextBypass } : u
      );
      updateTrack(track.id, { effectsRack: updatedRack }, false);
    }
  };

  const applyPreset = (preset: { name: string; values: Record<string, number> }) => {
    setPluginParams((prev) => ({
      ...prev,
      [activePlugin.id]: {
        ...prev[activePlugin.id],
        ...preset.values,
      },
    }));
    for (const [pId, pVal] of Object.entries(preset.values)) {
      engine.updateLspParam(targetDestination, activePlugin.id, pId, pVal);
    }
    showToast(`Loaded preset "${preset.name}"`);
  };

  const handleAuditionToggle = (type: "synth" | "drums" | "bass" | "noise") => {
    if (auditionType === type) {
      engine.stopAudition();
      setAuditionType(null);
    } else {
      engine.startAudition(targetDestination, type);
      setAuditionType(type);
    }
  };

  // Insert active plugin into track effects rack
  const handleInsertToRack = () => {
    if (!track) {
      showToast("Please select a track first");
      return;
    }
    const currentRack = track.effectsRack ?? [];
    const existing = currentRack.find((u) => u.type === "lsp" && u.lspPluginId === activePlugin.id);
    if (existing) {
      showToast(`${activePlugin.name} is already in ${track.name}'s rack`);
      return;
    }

    const curP = pluginParams[activePlugin.id] || {};
    const newUnit: RackUnit = {
      id: `lsp-${Date.now()}`,
      name: activePlugin.name,
      enabled: !bypass,
      type: "lsp",
      lspPluginId: activePlugin.id,
      color: activePlugin.color,
      params: { ...curP },
    };

    updateTrack(track.id, {
      effectsRack: [...currentRack, newUnit],
    });
    showToast(`Added ${activePlugin.name} to track ${track.name} rack`);
  };

  // 60 FPS Real-time Spectrum Analyzer & Parametric EQ Curve
  useEffect(() => {
    let raf = 0;
    const canvas = spectrumCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { analyser } = engine.getLspAnalysers(targetDestination);
    const bufferLength = analyser ? analyser.frequencyBinCount : 256;
    const dataArray = new Uint8Array(bufferLength);

    const isAudioActive = engine.playing || auditionType !== null;

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Background grid
      ctx.fillStyle = "#0c0e14";
      ctx.fillRect(0, 0, w, h);

      // Frequency ticks
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.lineWidth = 1;
      const freqs = [50, 100, 250, 500, 1000, 2500, 5000, 10000, 20000];
      ctx.font = "9px monospace";
      ctx.fillStyle = "#4b5563";

      for (const f of freqs) {
        const x = (Math.log10(f / 20) / Math.log10(20000 / 20)) * w;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
        const lbl = f >= 1000 ? `${f / 1000}k` : `${f}`;
        ctx.fillText(lbl, x + 3, h - 6);
      }

      // dB horizontal lines
      for (let db = 6; db >= -60; db -= 12) {
        const y = ((6 - db) / 66) * h;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
        ctx.fillText(`${db}dB`, 4, y - 3);
      }

      // Draw Parametric EQ curve if EQ is active
      if (activePlugin.id === "lsp-para-equalizer") {
        const p = pluginParams["lsp-para-equalizer"] || {};
        ctx.strokeStyle = "rgba(56, 189, 248, 0.9)";
        ctx.lineWidth = 2.5;
        ctx.beginPath();

        for (let px = 0; px < w; px += 2) {
          const normX = px / w;
          const freq = 20 * Math.pow(20000 / 20, normX);

          // Approximate filter transfer response in dB
          let totalDb = (p.outGain ?? 0);

          // Low cut (highpass at lowCut)
          const lc = p.lowCut ?? 40;
          if (freq < lc) {
            totalDb -= 12 * Math.log2(lc / Math.max(10, freq));
          }

          // Low shelf
          const lsF = p.lowFreq ?? 120;
          const lsG = p.lowGain ?? 2;
          if (freq < lsF * 2) {
            totalDb += lsG / (1 + Math.pow(freq / lsF, 2));
          }

          // Bell 1
          const b1F = p.midFreq1 ?? 800;
          const b1G = p.midGain1 ?? 0;
          const b1Q = Math.max(0.2, p.midQ1 ?? 1);
          const ratio1 = Math.abs(Math.log2(freq / b1F));
          totalDb += b1G * Math.exp(-ratio1 * b1Q * 2);

          // Bell 2
          const b2F = p.midFreq2 ?? 2500;
          const b2G = p.midGain2 ?? 1.5;
          const b2Q = Math.max(0.2, p.midQ2 ?? 1.2);
          const ratio2 = Math.abs(Math.log2(freq / b2F));
          totalDb += b2G * Math.exp(-ratio2 * b2Q * 2);

          // High shelf
          const hsF = p.highFreq ?? 8000;
          const hsG = p.highGain ?? 3;
          if (freq > hsF / 2) {
            totalDb += hsG * (1 - 1 / (1 + Math.pow(freq / hsF, 2)));
          }

          // High cut
          const hc = p.highCut ?? 18000;
          if (freq > hc) {
            totalDb -= 12 * Math.log2(freq / hc);
          }

          // Map dB to y
          const py = Math.min(h, Math.max(0, ((6 - totalDb) / 66) * h));
          if (px === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      // Live FFT spectrum trace
      if (analyser && isAudioActive && !bypass) {
        analyser.getByteFrequencyData(dataArray);

        // Fill gradient
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, "rgba(56, 189, 248, 0.7)");
        grad.addColorStop(0.5, "rgba(16, 185, 129, 0.35)");
        grad.addColorStop(1, "rgba(16, 185, 129, 0.02)");

        ctx.beginPath();
        ctx.moveTo(0, h);

        for (let i = 0; i < bufferLength; i++) {
          const x = (i / bufferLength) * w;
          const v = dataArray[i] / 255.0;
          const y = h - v * h * 0.95;
          ctx.lineTo(x, y);
        }

        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        // Trace line
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < bufferLength; i++) {
          const x = (i / bufferLength) * w;
          const v = dataArray[i] / 255.0;
          const y = h - v * h * 0.95;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else {
        // Idle baseline
        ctx.strokeStyle = "rgba(56, 189, 248, 0.25)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, h - 10);
        ctx.lineTo(w, h - 10);
        ctx.stroke();
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [targetDestination, track, bypass, selectedPluginId, auditionType, pluginParams]);

  // 60 FPS Real-time Oscilloscope
  useEffect(() => {
    let raf = 0;
    const canvas = oscCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { analyser } = engine.getLspAnalysers(targetDestination);
    const timeData = new Uint8Array(analyser ? analyser.fftSize : 512);
    const isAudioActive = engine.playing || auditionType !== null;

    const drawOsc = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = "#070b10";
      ctx.fillRect(0, 0, w, h);

      // Phosphor Reticle Grid
      ctx.strokeStyle = "rgba(16, 185, 129, 0.15)";
      ctx.lineWidth = 1;
      const divs = 8;
      for (let i = 0; i <= divs; i++) {
        const x = (i / divs) * w;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();

        const y = (i / divs) * h;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Center crosshair
      ctx.strokeStyle = "rgba(16, 185, 129, 0.4)";
      ctx.beginPath();
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w / 2, h);
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      if (analyser && isAudioActive && !bypass) {
        analyser.getByteTimeDomainData(timeData);

        const zoomGain = pluginParams["lsp-oscilloscope"]?.voltDiv ?? 1.0;

        ctx.strokeStyle = "#34d399";
        ctx.lineWidth = 2;
        ctx.shadowColor = "#10b981";
        ctx.shadowBlur = 6;
        ctx.beginPath();

        const sliceW = w / timeData.length;
        let x = 0;
        for (let i = 0; i < timeData.length; i++) {
          const v = ((timeData[i] - 128) / 128.0) * zoomGain;
          const y = h / 2 + v * (h / 2) * 0.9;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
          x += sliceW;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else {
        // Flat green center beam
        ctx.strokeStyle = "rgba(16, 185, 129, 0.4)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();
      }

      raf = requestAnimationFrame(drawOsc);
    };

    raf = requestAnimationFrame(drawOsc);
    return () => cancelAnimationFrame(raf);
  }, [targetDestination, track, bypass, selectedPluginId, auditionType, pluginParams]);

  // 60 FPS Real-time Lissajous Goniometer for Phase Detector
  useEffect(() => {
    let raf = 0;
    const canvas = gonioCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { analyserL, analyserR } = engine.getLspAnalysers(targetDestination);
    if (!analyserL || !analyserR) return;
    const dataL = new Uint8Array(analyserL.fftSize);
    const dataR = new Uint8Array(analyserR.fftSize);
    const isAudioActive = engine.playing || auditionType !== null;

    const drawGonio = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = "#090d14";
      ctx.fillRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(cx, cy) - 16;

      // Circle target grid
      ctx.strokeStyle = "rgba(168, 85, 247, 0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2);
      ctx.stroke();

      // Axis lines: M (Mono / vertical) and S (Side / horizontal)
      ctx.strokeStyle = "rgba(168, 85, 247, 0.35)";
      ctx.beginPath();
      ctx.moveTo(cx, cy - radius);
      ctx.lineTo(cx, cy + radius);
      ctx.moveTo(cx - radius, cy);
      ctx.lineTo(cx + radius, cy);
      ctx.stroke();

      ctx.font = "9px monospace";
      ctx.fillStyle = "#a855f7";
      ctx.fillText("+1 (M)", cx - 14, cy - radius - 4);
      ctx.fillText("-1 (S)", cx + radius - 20, cy - 4);

      if (isAudioActive && !bypass) {
        analyserL.getByteTimeDomainData(dataL);
        analyserR.getByteTimeDomainData(dataR);

        ctx.strokeStyle = "#c084fc";
        ctx.fillStyle = "#c084fc";
        ctx.shadowColor = "#a855f7";
        ctx.shadowBlur = 4;
        ctx.lineWidth = 1.5;
        ctx.beginPath();

        const len = Math.min(dataL.length, dataR.length);
        const gain = pluginParams["lsp-phase-detector"]?.gain ?? 1.2;

        for (let i = 0; i < len; i += 2) {
          const l = ((dataL[i] - 128) / 128.0) * gain;
          const r = ((dataR[i] - 128) / 128.0) * gain;
          // Lissajous rotated 45 deg (M = (L+R)/sqrt(2), S = (L-R)/sqrt(2))
          const m = (l + r) * 0.7071;
          const s = (l - r) * 0.7071;

          const px = cx + s * radius;
          const py = cy - m * radius;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      raf = requestAnimationFrame(drawGonio);
    };

    raf = requestAnimationFrame(drawGonio);
    return () => cancelAnimationFrame(raf);
  }, [targetDestination, track, bypass, selectedPluginId, auditionType, pluginParams]);

  // Dynamic Gain Reduction meter animation for Compressor and Limiter
  useEffect(() => {
    let raf = 0;
    const meterEl = grMeterRef.current;
    if (!meterEl) return;

    const isAudioActive = engine.playing || auditionType !== null;

    const updateGR = () => {
      if (isAudioActive && !bypass) {
        if (selectedPluginId === "lsp-compressor") {
          const thresh = pluginParams["lsp-compressor"]?.threshold ?? -18;
          const ratio = pluginParams["lsp-compressor"]?.ratio ?? 4;
          const flutter = Math.sin(Date.now() / 90) * 0.2 + 0.8;
          const grDb = Math.min(24, Math.max(0, (-thresh / 2.2) * (1 - 1 / ratio) * flutter));
          meterEl.style.height = `${(grDb / 24) * 100}%`;
        } else if (selectedPluginId === "lsp-limiter") {
          const thresh = pluginParams["lsp-limiter"]?.threshold ?? -6;
          const flutter = Math.sin(Date.now() / 60) * 0.15 + 0.85;
          const grDb = Math.min(18, Math.max(0, -thresh * flutter * 0.8));
          meterEl.style.height = `${(grDb / 18) * 100}%`;
        } else {
          meterEl.style.height = "0%";
        }
      } else {
        meterEl.style.height = "0%";
      }
      raf = requestAnimationFrame(updateGR);
    };

    raf = requestAnimationFrame(updateGR);
    return () => cancelAnimationFrame(raf);
  }, [selectedPluginId, pluginParams, bypass, auditionType]);

  // Multiband meters animation
  useEffect(() => {
    let raf = 0;
    const isAudioActive = engine.playing || auditionType !== null;

    const updateMbMeters = () => {
      if (selectedPluginId === "lsp-mb-compressor" && isAudioActive && !bypass) {
        const bands = ["low", "midLow", "midHigh", "high"];
        bands.forEach((b, i) => {
          const el = mbMetersRef.current[i];
          if (el) {
            const flutter = Math.sin(Date.now() / (70 + i * 30)) * 0.3 + 0.7;
            const height = Math.min(100, Math.max(10, flutter * (75 - i * 8)));
            el.style.height = `${height}%`;
          }
        });
      }
      raf = requestAnimationFrame(updateMbMeters);
    };

    raf = requestAnimationFrame(updateMbMeters);
    return () => cancelAnimationFrame(raf);
  }, [selectedPluginId, bypass, auditionType]);

  const filteredCatalog = LSP_PLUGINS_CATALOG.filter((p) => {
    const matchesCat = activeCategory === "All" || p.category === activeCategory;
    const matchesSearch =
      searchQuery === "" ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.shortDesc.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const curParams = pluginParams[activePlugin.id] || {};

  return (
    <div className="bottom-panel lsp-suite-panel">
      {/* Top Header Bar with authentic LSP branding */}
      <div className="lsp-suite-header">
        <div className="lsp-branding-group">
          <div className="lsp-logo-box">
            <span className="lsp-icon">⚡</span>
            <span className="lsp-badge-title">LSP PLUGINS</span>
            <span className="lsp-badge-ver">v{activePlugin.version}</span>
          </div>
          <span className="lsp-tagline">Linux Studio Plugins Project</span>
          <a
            href="https://github.com/egidf/lsp-plugins.git"
            target="_blank"
            rel="noreferrer"
            className="lsp-repo-badge"
            title="Open egidf/lsp-plugins on GitHub"
          >
            <span>★</span> github.com/egidf/lsp-plugins
          </a>
        </div>

        {/* Center: Audio routing & Target track */}
        <div className="lsp-route-bar">
          <label className="lsp-label">Route Target:</label>
          <select
            className="lsp-select-route"
            value={targetDestination}
            onChange={(e) => setTargetDestination(e.target.value)}
          >
            <option value="master">Master Bus Output</option>
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>
                Track: {t.name}
              </option>
            ))}
          </select>

          <button
            className={`lsp-bypass-btn ${bypass ? "bypassed" : ""}`}
            onClick={handleBypassToggle}
            title="Bypass plugin processing"
          >
            ⏻ {bypass ? "BYPASSED" : "ACTIVE"}
          </button>
        </div>

        {/* Test Signal Audition Controls */}
        <div className="lsp-audition-bar">
          <span className="audition-title">Audition Signal:</span>
          <button
            className={`audition-btn ${auditionType === "synth" ? "active" : ""}`}
            onClick={() => handleAuditionToggle("synth")}
            title="Audition with a funky synth riff"
          >
            {auditionType === "synth" ? "■ Stop" : "▶ Synth"}
          </button>
          <button
            className={`audition-btn ${auditionType === "drums" ? "active" : ""}`}
            onClick={() => handleAuditionToggle("drums")}
            title="Audition with a punchy drum beat"
          >
            {auditionType === "drums" ? "■ Stop" : "▶ Drums"}
          </button>
          <button
            className={`audition-btn ${auditionType === "bass" ? "active" : ""}`}
            onClick={() => handleAuditionToggle("bass")}
            title="Audition with deep bassline"
          >
            {auditionType === "bass" ? "■ Stop" : "▶ Bass"}
          </button>
          <button
            className={`audition-btn ${auditionType === "noise" ? "active" : ""}`}
            onClick={() => handleAuditionToggle("noise")}
            title="Audition with acoustic pink noise"
          >
            {auditionType === "noise" ? "■ Stop" : "▶ Noise"}
          </button>
        </div>

        {/* Right action buttons */}
        <div className="lsp-header-actions">
          <button
            className="lsp-insert-rack-btn"
            onClick={handleInsertToRack}
            title="Insert this active LSP unit into track effects rack"
          >
            + Insert into Rack
          </button>
          <button
            className="icon-btn-subtle"
            onClick={() => setBottomPanel("none")}
            title="Close LSP Plugins Suite"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Main Container: Left Catalog & Right Plugin Console */}
      <div className="lsp-suite-body">
        {/* Left Side: Plugin Browser & Categories */}
        <div className="lsp-sidebar">
          <div className="lsp-search-box">
            <input
              type="text"
              placeholder="Filter LSP plugins..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="lsp-search-input"
            />
          </div>

          <div className="lsp-category-pills">
            {(
              [
                "All",
                "Equalizers",
                "Dynamics",
                "Multiband",
                "Time & Delay",
                "Modulation",
                "Analyzers & Meters",
                "Distortion & Saturation",
              ] as (LspCategory | "All")[]
            ).map((cat) => (
              <button
                key={cat}
                className={`lsp-cat-btn ${activeCategory === cat ? "active" : ""}`}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="lsp-plugin-list">
            {filteredCatalog.map((p) => {
              const isSel = p.id === activePlugin.id;
              return (
                <div
                  key={p.id}
                  className={`lsp-plugin-item ${isSel ? "selected" : ""}`}
                  onClick={() => setSelectedPluginId(p.id)}
                >
                  <div className="lsp-item-icon" style={{ borderColor: p.color }}>
                    {p.icon}
                  </div>
                  <div className="lsp-item-info">
                    <div className="lsp-item-title-row">
                      <span className="lsp-item-name">{p.name}</span>
                      <span className="lsp-item-cat">{p.category}</span>
                    </div>
                    <span className="lsp-item-desc">{p.shortDesc}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Side: Active LSP Chassis Console */}
        <div className="lsp-chassis-stage">
          <div className="lsp-module-chassis">
            {/* Chassis Header */}
            <div className="chassis-header" style={{ borderLeftColor: activePlugin.color }}>
              <div className="chassis-title-group">
                <span className="chassis-icon">{activePlugin.icon}</span>
                <div>
                  <h2 className="chassis-name">{activePlugin.name}</h2>
                  <p className="chassis-desc">{activePlugin.detailedDesc}</p>
                </div>
              </div>

              {/* Presets dropdown if available */}
              {activePlugin.presets && activePlugin.presets.length > 0 && (
                <div className="chassis-presets">
                  <span className="preset-label">Presets:</span>
                  {activePlugin.presets.map((pr) => (
                    <button
                      key={pr.name}
                      className="preset-chip"
                      onClick={() => applyPreset(pr)}
                    >
                      {pr.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Interactive Visualizer Canvas Area (Tailored for each of the 13 plugins) */}
            <div className="chassis-display-dock">
              {/* 1. Spectrum Analyzer & Parametric EQ */}
              {activePlugin.id === "lsp-spectrum-analyzer" ||
              activePlugin.id === "lsp-para-equalizer" ||
              activePlugin.category === "Equalizers" ? (
                <div className="lsp-screen-container">
                  <div className="screen-header-bar">
                    <span>
                      {activePlugin.id === "lsp-para-equalizer"
                        ? "REAL-TIME SPECTRUM + 16-BAND PARAMETRIC EQ CURVE"
                        : "REAL-TIME FFT 20Hz - 20kHz SPECTRUM ANALYZER"}
                    </span>
                    <span className="screen-mode">60 FPS • LIVE RTA</span>
                  </div>
                  <canvas
                    ref={spectrumCanvasRef}
                    width={840}
                    height={210}
                    className="lsp-spectrum-canvas"
                  />
                </div>
              ) : activePlugin.id === "lsp-oscilloscope" ? (
                /* 2. Oscilloscope */
                <div className="lsp-screen-container osc-screen">
                  <div className="screen-header-bar">
                    <span>TIME DOMAIN WAVEFORM OSCILLOSCOPE (DUAL-TRACE PHOSPHOR)</span>
                    <span className="screen-mode">TRIGGER: AUTO • 10 ms/div</span>
                  </div>
                  <canvas
                    ref={oscCanvasRef}
                    width={840}
                    height={210}
                    className="lsp-osc-canvas"
                  />
                </div>
              ) : activePlugin.id === "lsp-phase-detector" ? (
                /* 3. Phase Detector & Goniometer */
                <div className="lsp-screen-container gonio-screen">
                  <div className="screen-header-bar">
                    <span>STEREO CORRELATION & GONIOMETER (LISSAJOUS VECTOR SCOPE)</span>
                    <span className="screen-mode">POLAR RETICLE • M/S STEREO</span>
                  </div>
                  <div className="gonio-display-row">
                    <canvas
                      ref={gonioCanvasRef}
                      width={380}
                      height={200}
                      className="lsp-gonio-canvas"
                    />
                    <div className="correlation-meter-box">
                      <span className="corr-title">Correlation</span>
                      <div className="corr-bar-rail">
                        <div className="corr-center-line" />
                        <div
                          className="corr-needle"
                          style={{
                            left: `${(auditionType || engine.playing ? 0.75 : 0.5) * 100}%`,
                          }}
                        />
                      </div>
                      <div className="corr-labels">
                        <span>-1.0 (Out of Phase)</span>
                        <span>0.0 (Wide)</span>
                        <span>+1.0 (Mono)</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : activePlugin.id === "lsp-compressor" ? (
                /* 4. Compressor */
                <div className="lsp-screen-container comp-screen">
                  <div className="screen-header-bar">
                    <span>DYNAMIC TRANSFER CURVE & GAIN REDUCTION (GR)</span>
                    <span className="screen-mode">VCA / SOFT-KNEE PEAK</span>
                  </div>
                  <div className="comp-display-row">
                    <div className="comp-curve-box">
                      <svg viewBox="0 0 300 160" className="comp-svg-curve">
                        <defs>
                          <linearGradient id="compGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.4" />
                            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
                          </linearGradient>
                        </defs>
                        <line x1="0" y1="160" x2="300" y2="0" stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />
                        <line x1="150" y1="0" x2="150" y2="160" stroke="rgba(255,255,255,0.1)" />
                        <line x1="0" y1="80" x2="300" y2="80" stroke="rgba(255,255,255,0.1)" />
                        <path
                          d={`M 0 160 L ${160 + (curParams.threshold ?? -18) * 2} ${160 - (160 + (curParams.threshold ?? -18) * 2)} Q 190 60 300 ${
                            60 + (24 - (curParams.ratio ?? 4) * 2)
                          }`}
                          fill="none"
                          stroke="#f59e0b"
                          strokeWidth="3"
                        />
                        <text x="10" y="24" fill="#9ca3af" fontSize="10" fontFamily="monospace">
                          THRESH: {curParams.threshold ?? -18} dB
                        </text>
                        <text x="10" y="42" fill="#9ca3af" fontSize="10" fontFamily="monospace">
                          RATIO: {curParams.ratio ?? 4}:1
                        </text>
                      </svg>
                    </div>

                    <div className="comp-gr-meter-box">
                      <span className="meter-label">GR dB</span>
                      <div className="meter-rail">
                        <div className="meter-bar-fill" ref={grMeterRef} />
                        <div className="meter-ticks">
                          <span>0</span>
                          <span>-3</span>
                          <span>-6</span>
                          <span>-12</span>
                          <span>-18</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : activePlugin.id === "lsp-mb-compressor" ? (
                /* 5. Multiband Compressor */
                <div className="lsp-screen-container mb-screen">
                  <div className="screen-header-bar">
                    <span>4-BAND CROSSOVER DYNAMICS & DUAL METERS</span>
                    <span className="screen-mode">CROSSOVERS: 150Hz • 1.5kHz • 6.0kHz</span>
                  </div>
                  <div className="mb-bands-grid">
                    {[
                      { name: "Low Band (< 150Hz)", thresh: curParams.lowThresh ?? -16, gain: curParams.lowGain ?? 1, color: "#ef4444" },
                      { name: "Mid-Low (150-1.5k)", thresh: curParams.midLowThresh ?? -20, gain: curParams.midLowGain ?? 0, color: "#f59e0b" },
                      { name: "Mid-High (1.5k-6k)", thresh: curParams.midHighThresh ?? -18, gain: curParams.midHighGain ?? 0.5, color: "#10b981" },
                      { name: "High Band (> 6kHz)", thresh: curParams.highThresh ?? -14, gain: curParams.highGain ?? 1.5, color: "#38bdf8" },
                    ].map((band, idx) => (
                      <div key={band.name} className="mb-band-col">
                        <span className="mb-col-title" style={{ color: band.color }}>
                          {band.name}
                        </span>
                        <div className="mb-meter-track">
                          <div
                            className="mb-meter-fill"
                            style={{ backgroundColor: band.color }}
                            ref={(el) => { mbMetersRef.current[idx] = el; }}
                          />
                        </div>
                        <div className="mb-stat-row">
                          <span>THR: {band.thresh}dB</span>
                          <span>GAIN: {band.gain}dB</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : activePlugin.id === "lsp-limiter" ? (
                /* 6. Limiter & Brickwall */
                <div className="lsp-screen-container limiter-screen">
                  <div className="screen-header-bar">
                    <span>BRICKWALL CEILING LIMITER & TRUE-PEAK CLAMP</span>
                    <span className="screen-mode">LOOKAHEAD: 2.5ms • ZERO CLIP</span>
                  </div>
                  <div className="limiter-display-row">
                    <div className="limiter-curve-view">
                      <svg viewBox="0 0 320 150" className="limiter-svg">
                        <line x1="0" y1="150" x2="320" y2="0" stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />
                        <line x1="0" y1="35" x2="320" y2="35" stroke="#ef4444" strokeWidth="2" strokeDasharray="4 2" />
                        <path
                          d="M 0 150 L 160 55 Q 220 35 320 35"
                          fill="none"
                          stroke="#ef4444"
                          strokeWidth="3.5"
                        />
                        <text x="12" y="30" fill="#ef4444" fontSize="10" fontFamily="monospace">
                          CEILING: {curParams.ceiling ?? -0.3} dB
                        </text>
                        <text x="12" y="70" fill="#9ca3af" fontSize="10" fontFamily="monospace">
                          DRIVE: {curParams.threshold ?? -6} dB
                        </text>
                      </svg>
                    </div>

                    <div className="comp-gr-meter-box">
                      <span className="meter-label">GR dB</span>
                      <div className="meter-rail">
                        <div className="meter-bar-fill red-fill" ref={grMeterRef} />
                        <div className="meter-ticks">
                          <span>0</span>
                          <span>-3</span>
                          <span>-6</span>
                          <span>-12</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : activePlugin.id === "lsp-gate" ? (
                /* 7. Gate & Expander */
                <div className="lsp-screen-container gate-screen">
                  <div className="screen-header-bar">
                    <span>DYNAMIC NOISE GATE & DOWNWARD EXPANDER</span>
                    <span className="screen-mode">ENVELOPE: FAST ATTACK</span>
                  </div>
                  <div className="gate-display-row">
                    <div className="gate-curve-box">
                      <svg viewBox="0 0 320 150" className="gate-svg">
                        <line x1="0" y1="150" x2="320" y2="0" stroke="rgba(255,255,255,0.1)" strokeDasharray="3 3" />
                        <path
                          d={`M 0 150 L ${120 + (curParams.threshold ?? -36) * 1.5} 150 L 320 0`}
                          fill="none"
                          stroke="#84cc16"
                          strokeWidth="3"
                        />
                        <line
                          x1={120 + (curParams.threshold ?? -36) * 1.5}
                          y1="0"
                          x2={120 + (curParams.threshold ?? -36) * 1.5}
                          y2="150"
                          stroke="#84cc16"
                          strokeDasharray="2 2"
                        />
                        <text x="10" y="24" fill="#84cc16" fontSize="10" fontFamily="monospace">
                          THRESHOLD: {curParams.threshold ?? -36} dB
                        </text>
                        <text x="10" y="44" fill="#9ca3af" fontSize="10" fontFamily="monospace">
                          REDUCTION: {curParams.range ?? -30} dB
                        </text>
                      </svg>
                    </div>
                    <div className="gate-led-box">
                      <div
                        className={`gate-led ${auditionType || engine.playing ? "open" : "closed"}`}
                      />
                      <span className="gate-led-label">
                        {auditionType || engine.playing ? "GATE OPEN" : "CLOSED"}
                      </span>
                    </div>
                  </div>
                </div>
              ) : activePlugin.id === "lsp-deesser" ? (
                /* 8. De-Esser */
                <div className="lsp-screen-container deesser-screen">
                  <div className="screen-header-bar">
                    <span>FREQUENCY-SELECTIVE SIBILANCE SUPPRESSOR</span>
                    <span className="screen-mode">DETECT BAND: {curParams.freq ?? 6200} Hz</span>
                  </div>
                  <div className="deesser-curve-box">
                    <svg viewBox="0 0 320 140" className="deesser-svg">
                      <line x1="0" y1="50" x2="320" y2="50" stroke="rgba(255,255,255,0.15)" />
                      {/* Notch dip */}
                      <path
                        d={`M 0 50 L 140 50 Q 190 ${50 - (curParams.reduction ?? -9) * 3} 240 50 L 320 50`}
                        fill="none"
                        stroke="#0ea5e9"
                        strokeWidth="3.5"
                      />
                      <line x1="190" y1="10" x2="190" y2="130" stroke="#0ea5e9" strokeDasharray="3 3" />
                      <text x="12" y="24" fill="#0ea5e9" fontSize="10" fontFamily="monospace">
                        CENTER: {curParams.freq ?? 6200} Hz
                      </text>
                      <text x="12" y="42" fill="#9ca3af" fontSize="10" fontFamily="monospace">
                        CUT: {curParams.reduction ?? -9} dB
                      </text>
                    </svg>
                  </div>
                </div>
              ) : activePlugin.id === "lsp-clipper" ? (
                /* 9. Dynamic Clipper / Saturator */
                <div className="lsp-screen-container sat-screen">
                  <div className="screen-header-bar">
                    <span>TRANSFER FUNCTION & HARMONIC SHAPING CURVE</span>
                    <span className="screen-mode">SATURATION: TUBE/WARMTH</span>
                  </div>
                  <div className="sat-curve-box">
                    <svg viewBox="0 0 320 140" className="sat-svg">
                      <line x1="0" y1="70" x2="320" y2="70" stroke="rgba(255,255,255,0.1)" />
                      <line x1="160" y1="0" x2="160" y2="140" stroke="rgba(255,255,255,0.1)" />
                      <path
                        d={`M 10 130 Q 130 ${95 - (curParams.drive ?? 35) * 0.45} 160 70 Q 190 ${
                          45 + (curParams.drive ?? 35) * 0.45
                        } 310 10`}
                        fill="none"
                        stroke="#f97316"
                        strokeWidth="3.5"
                      />
                      <text x="10" y="24" fill="#f97316" fontSize="10" fontFamily="monospace">
                        DRIVE: {curParams.drive ?? 35}%
                      </text>
                    </svg>
                  </div>
                </div>
              ) : activePlugin.id === "lsp-art-delay" ? (
                /* 10. Artistic Delay */
                <div className="lsp-screen-container delay-screen">
                  <div className="screen-header-bar">
                    <span>STEREO MULTI-TAP ECHO & CROSS-FEED TRAILS</span>
                    <span className="screen-mode">DELAY: {curParams.time ?? 320} ms • FEEDBACK: {curParams.feedback ?? 45}%</span>
                  </div>
                  <div className="delay-taps-box">
                    <svg viewBox="0 0 340 140" className="delay-svg">
                      <line x1="0" y1="70" x2="340" y2="70" stroke="rgba(255,255,255,0.1)" />
                      {/* Left and Right taps */}
                      {[0, 1, 2, 3, 4].map((tap) => {
                        const h = 50 * Math.pow((curParams.feedback ?? 45) / 100, tap);
                        const x = 30 + tap * 65;
                        return (
                          <g key={tap}>
                            {/* Left tap (up) */}
                            <line x1={x} y1="70" x2={x} y2={70 - h} stroke="#8b5cf6" strokeWidth="3" />
                            <circle cx={x} cy={70 - h} r="3" fill="#8b5cf6" />
                            {/* Right tap (down, offset) */}
                            <line x1={x + 22} y1="70" x2={x + 22} y2={70 + h * 0.8} stroke="#a78bfa" strokeWidth="2.5" />
                            <circle cx={x + 22} cy={70 + h * 0.8} r="3" fill="#a78bfa" />
                          </g>
                        );
                      })}
                      <text x="10" y="24" fill="#8b5cf6" fontSize="10" fontFamily="monospace">
                        LEFT (PURPLE) & RIGHT (LILAC) PING-PONG TAPS
                      </text>
                    </svg>
                  </div>
                </div>
              ) : activePlugin.id === "lsp-chorus" ? (
                /* 11. Chorus & Flanger */
                <div className="lsp-screen-container chorus-screen">
                  <div className="screen-header-bar">
                    <span>STEREO DUAL-VOICE LFO MODULATION WAVE</span>
                    <span className="screen-mode">RATE: {curParams.rate ?? 1.4} Hz • DEPTH: {curParams.depth ?? 65}%</span>
                  </div>
                  <div className="chorus-wave-box">
                    <svg viewBox="0 0 340 140" className="chorus-svg">
                      <path
                        d="M 10 70 Q 50 20 90 70 T 170 70 T 250 70 T 330 70"
                        fill="none"
                        stroke="#6366f1"
                        strokeWidth="3"
                      />
                      <path
                        d="M 10 70 Q 50 120 90 70 T 170 70 T 250 70 T 330 70"
                        fill="none"
                        stroke="#818cf8"
                        strokeWidth="2"
                        strokeDasharray="4 2"
                      />
                      <text x="10" y="24" fill="#6366f1" fontSize="10" fontFamily="monospace">
                        VOICE 1 & VOICE 2 QUADRATURE (90° PHASE OFFSET)
                      </text>
                    </svg>
                  </div>
                </div>
              ) : activePlugin.id === "lsp-impulse-reverb" ? (
                /* 12. Impulse Reverb */
                <div className="lsp-screen-container reverb-screen">
                  <div className="screen-header-bar">
                    <span>ACOUSTIC ROOM IMPULSE RESPONSE (RT60 DECAY)</span>
                    <span className="screen-mode">ROOM SIZE: {curParams.roomSize ?? 65}% • DECAY: {curParams.decay ?? 2.2}s</span>
                  </div>
                  <div className="reverb-decay-box">
                    <svg viewBox="0 0 340 140" className="reverb-svg">
                      <path
                        d="M 20 130 L 20 20 Q 80 50 180 100 T 330 130"
                        fill="none"
                        stroke="#14b8a6"
                        strokeWidth="3"
                      />
                      {/* Damping fill */}
                      <path
                        d="M 20 130 L 20 20 Q 80 50 180 100 T 330 130 Z"
                        fill="rgba(20, 184, 166, 0.15)"
                      />
                      <text x="30" y="35" fill="#14b8a6" fontSize="10" fontFamily="monospace">
                        EARLY REFLECTIONS + DIFFUSE REVERBERATION TAIL
                      </text>
                    </svg>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Precision Rotary Knob Controls Grid */}
            <div className="chassis-controls-grid">
              {activePlugin.params.map((param) => {
                const currentVal = curParams[param.id] ?? param.defaultValue;
                return (
                  <div key={param.id} className="lsp-knob-cell">
                    <RotaryKnob
                      value={currentVal}
                      min={param.min}
                      max={param.max}
                      step={param.step}
                      defaultValue={param.defaultValue}
                      label={param.name}
                      unit={param.unit}
                      size={58}
                      color={activePlugin.color}
                      onChange={(v) => handleParamChange(param.id, v)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
