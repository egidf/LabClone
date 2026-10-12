/**
 * Linux Studio Plugins (LSP Plugins) Suite for Web DAW
 * Based on https://github.com/egidf/lsp-plugins.git
 * Open-source audio plugins collection (Release v1.2.35)
 */

export interface LspParameter {
  id: string;
  name: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  unit: string;
  description?: string;
}

export type LspCategory =
  | "Equalizers"
  | "Dynamics"
  | "Multiband"
  | "Time & Delay"
  | "Modulation"
  | "Analyzers & Meters"
  | "Distortion & Saturation";

export interface LspPluginDef {
  id: string;
  name: string;
  category: LspCategory;
  shortDesc: string;
  detailedDesc: string;
  version: string;
  githubUrl: string;
  icon: string;
  color: string;
  params: LspParameter[];
  presets?: { name: string; values: Record<string, number> }[];
}

export const LSP_PLUGINS_CATALOG: LspPluginDef[] = [
  {
    id: "lsp-para-equalizer",
    name: "LSP Para Equalizer x16",
    category: "Equalizers",
    shortDesc: "16-band parametric equalizer with high-precision biquad filters and visual spectrum",
    detailedDesc:
      "High-grade parametric equalizer with up to 16 configurable filters (Low Cut, Low Shelf, Bell, High Shelf, High Cut), per-band Q bandwidth control, and real-time transfer function visualization.",
    version: "1.2.35",
    githubUrl: "https://github.com/egidf/lsp-plugins.git",
    icon: "🎚️",
    color: "#38bdf8",
    params: [
      { id: "lowCut", name: "Low Cut Freq", min: 20, max: 500, step: 1, defaultValue: 40, unit: "Hz" },
      { id: "lowGain", name: "Low Shelf Gain", min: -18, max: 18, step: 0.5, defaultValue: 2, unit: "dB" },
      { id: "lowFreq", name: "Low Shelf Freq", min: 60, max: 400, step: 5, defaultValue: 120, unit: "Hz" },
      { id: "midGain1", name: "Bell 1 Gain", min: -18, max: 18, step: 0.5, defaultValue: 0, unit: "dB" },
      { id: "midFreq1", name: "Bell 1 Freq", min: 200, max: 3000, step: 10, defaultValue: 800, unit: "Hz" },
      { id: "midQ1", name: "Bell 1 Q", min: 0.2, max: 10, step: 0.1, defaultValue: 1.0, unit: "" },
      { id: "midGain2", name: "Bell 2 Gain", min: -18, max: 18, step: 0.5, defaultValue: 1.5, unit: "dB" },
      { id: "midFreq2", name: "Bell 2 Freq", min: 1000, max: 8000, step: 20, defaultValue: 2500, unit: "Hz" },
      { id: "midQ2", name: "Bell 2 Q", min: 0.2, max: 10, step: 0.1, defaultValue: 1.2, unit: "" },
      { id: "highGain", name: "High Shelf Gain", min: -18, max: 18, step: 0.5, defaultValue: 3, unit: "dB" },
      { id: "highFreq", name: "High Shelf Freq", min: 4000, max: 16000, step: 100, defaultValue: 8000, unit: "Hz" },
      { id: "highCut", name: "High Cut Freq", min: 10000, max: 20000, step: 100, defaultValue: 18000, unit: "Hz" },
      { id: "outGain", name: "Output Gain", min: -12, max: 12, step: 0.5, defaultValue: 0, unit: "dB" },
    ],
    presets: [
      {
        name: "Vocal Clarity",
        values: { lowCut: 80, lowGain: -2, lowFreq: 200, midGain1: -3, midFreq1: 500, midQ1: 1.4, midGain2: 3, midFreq2: 3500, midQ2: 1.0, highGain: 2.5, highFreq: 10000, highCut: 19000, outGain: 0 },
      },
      {
        name: "Warm Bass",
        values: { lowCut: 30, lowGain: 4.5, lowFreq: 90, midGain1: -2, midFreq1: 400, midQ1: 1.2, midGain2: -1, midFreq2: 1500, midQ2: 0.8, highGain: -2, highFreq: 6000, highCut: 14000, outGain: 0 },
      },
      {
        name: "Drum Master Punch",
        values: { lowCut: 35, lowGain: 3, lowFreq: 75, midGain1: -4, midFreq1: 380, midQ1: 1.8, midGain2: 2.5, midFreq2: 4500, midQ2: 1.5, highGain: 3, highFreq: 12000, highCut: 20000, outGain: 0.5 },
      },
    ],
  },

  {
    id: "lsp-compressor",
    name: "LSP Compressor Mono/Stereo",
    category: "Dynamics",
    shortDesc: "Classic VCA/FET style compressor with knee smoothing, lookahead, and sidechain filter",
    detailedDesc:
      "Precision dynamic range compressor designed for transparent or aggressive dynamic reduction. Features soft/hard knee curve, sidechain high-pass filtering, and instant gain reduction metering.",
    version: "1.2.35",
    githubUrl: "https://github.com/egidf/lsp-plugins.git",
    icon: "🗜️",
    color: "#f59e0b",
    params: [
      { id: "threshold", name: "Threshold", min: -50, max: 0, step: 0.5, defaultValue: -18, unit: "dB" },
      { id: "ratio", name: "Ratio", min: 1, max: 20, step: 0.5, defaultValue: 4, unit: ":1" },
      { id: "attack", name: "Attack Time", min: 0.1, max: 100, step: 0.5, defaultValue: 12, unit: "ms" },
      { id: "release", name: "Release Time", min: 10, max: 1000, step: 5, defaultValue: 120, unit: "ms" },
      { id: "knee", name: "Knee Width", min: 0, max: 24, step: 0.5, defaultValue: 6, unit: "dB" },
      { id: "makeup", name: "Makeup Gain", min: 0, max: 24, step: 0.5, defaultValue: 3.5, unit: "dB" },
      { id: "mix", name: "Dry/Wet Mix", min: 0, max: 100, step: 1, defaultValue: 100, unit: "%" },
    ],
    presets: [
      { name: "Gentle Glue (2:1)", values: { threshold: -12, ratio: 2, attack: 30, release: 180, knee: 12, makeup: 1.5, mix: 100 } },
      { name: "Aggressive Smack (8:1)", values: { threshold: -24, ratio: 8, attack: 3, release: 80, knee: 3, makeup: 6, mix: 100 } },
      { name: "Parallel NY Drum Crush", values: { threshold: -32, ratio: 12, attack: 1, release: 60, knee: 0, makeup: 8, mix: 45 } },
    ],
  },

  {
    id: "lsp-mb-compressor",
    name: "LSP Multiband Compressor",
    category: "Multiband",
    shortDesc: "4-Band crossover dynamic compressor with split band processing",
    detailedDesc:
      "Four independent frequency bands (Low, Mid-Low, Mid-High, High) with customizable crossover points (120Hz, 1.2kHz, 6kHz). Tame harsh resonances, tighten low-end rumble, and master your mixes.",
    version: "1.2.35",
    githubUrl: "https://github.com/egidf/lsp-plugins.git",
    icon: "📊",
    color: "#ec4899",
    params: [
      { id: "lowThresh", name: "Low Band Thresh", min: -40, max: 0, step: 1, defaultValue: -16, unit: "dB" },
      { id: "lowGain", name: "Low Band Gain", min: -12, max: 12, step: 0.5, defaultValue: 1, unit: "dB" },
      { id: "midLowThresh", name: "Mid-Low Thresh", min: -40, max: 0, step: 1, defaultValue: -20, unit: "dB" },
      { id: "midLowGain", name: "Mid-Low Gain", min: -12, max: 12, step: 0.5, defaultValue: 0, unit: "dB" },
      { id: "midHighThresh", name: "Mid-High Thresh", min: -40, max: 0, step: 1, defaultValue: -18, unit: "dB" },
      { id: "midHighGain", name: "Mid-High Gain", min: -12, max: 12, step: 0.5, defaultValue: 0.5, unit: "dB" },
      { id: "highThresh", name: "High Band Thresh", min: -40, max: 0, step: 1, defaultValue: -14, unit: "dB" },
      { id: "highGain", name: "High Band Gain", min: -12, max: 12, step: 0.5, defaultValue: 1.5, unit: "dB" },
    ],
  },

  {
    id: "lsp-limiter",
    name: "LSP Limiter & Brickwall",
    category: "Dynamics",
    shortDesc: "Zero-latency brickwall limiter and loudness maximizer for mastering",
    detailedDesc:
      "Prevents true-peak digital overs while maximizing loudness. Provides adjustable ceiling, threshold boost, release envelope, and oversampling protection.",
    version: "1.2.35",
    githubUrl: "https://github.com/egidf/lsp-plugins.git",
    icon: "🛡️",
    color: "#ef4444",
    params: [
      { id: "ceiling", name: "Ceiling Limit", min: -12, max: 0, step: 0.1, defaultValue: -0.3, unit: "dB" },
      { id: "threshold", name: "Drive / Boost", min: -24, max: 0, step: 0.5, defaultValue: -6, unit: "dB" },
      { id: "release", name: "Release Time", min: 5, max: 500, step: 5, defaultValue: 45, unit: "ms" },
      { id: "lookahead", name: "Lookahead", min: 0.1, max: 10, step: 0.1, defaultValue: 2.5, unit: "ms" },
    ],
  },

  {
    id: "lsp-spectrum-analyzer",
    name: "LSP Spectrum Analyzer 32",
    category: "Analyzers & Meters",
    shortDesc: "High-resolution real-time FFT frequency spectrum analyzer with logarithmic scale",
    detailedDesc:
      "Real-time visual monitoring of spectral energy from 20 Hz to 20,000 Hz. Features customizable FFT window size, peak hold decay, slope tilt (-4.5 dB/oct), and high contrast phosphor UI.",
    version: "1.2.35",
    githubUrl: "https://github.com/egidf/lsp-plugins.git",
    icon: "📈",
    color: "#10b981",
    params: [
      { id: "fftSize", name: "FFT Resolution", min: 512, max: 4096, step: 512, defaultValue: 2048, unit: "pts" },
      { id: "decaySpeed", name: "Peak Decay", min: 1, max: 10, step: 1, defaultValue: 5, unit: "spd" },
      { id: "tilt", name: "Spectral Tilt", min: -6, max: 6, step: 0.5, defaultValue: 3, unit: "dB/oct" },
      { id: "minDb", name: "Floor Range", min: -90, max: -40, step: 5, defaultValue: -70, unit: "dB" },
    ],
  },

  {
    id: "lsp-oscilloscope",
    name: "LSP Oscilloscope",
    category: "Analyzers & Meters",
    shortDesc: "Dual-channel audio oscilloscope with trigger sync and persistence",
    detailedDesc:
      "Visualizes audio signal waveforms in the time domain. Ideal for monitoring synthesizer wave shapes, transient attacks, phase coherence, and DC offsets.",
    version: "1.2.35",
    githubUrl: "https://github.com/egidf/lsp-plugins.git",
    icon: "〰️",
    color: "#06b6d4",
    params: [
      { id: "timeDiv", name: "Time Base", min: 1, max: 50, step: 1, defaultValue: 10, unit: "ms/div" },
      { id: "voltDiv", name: "Zoom Gain", min: 0.2, max: 5, step: 0.1, defaultValue: 1.0, unit: "x" },
      { id: "triggerLevel", name: "Trigger Level", min: -1, max: 1, step: 0.05, defaultValue: 0.0, unit: "" },
      { id: "phosphor", name: "Glow Persistence", min: 0, max: 100, step: 5, defaultValue: 60, unit: "%" },
    ],
  },

  {
    id: "lsp-art-delay",
    name: "LSP Artistic Delay",
    category: "Time & Delay",
    shortDesc: "Stereo multi-tap delay with ping-pong, high/low cut filters, and tempo sync",
    detailedDesc:
      "Creative stereo delay with cross-feedback, ping-pong bouncing, BPM musical subdivisions (1/4, 1/8, 1/16 dotted/triplets), and high/low analog filter damping.",
    version: "1.2.35",
    githubUrl: "https://github.com/egidf/lsp-plugins.git",
    icon: "⏱️",
    color: "#8b5cf6",
    params: [
      { id: "time", name: "Delay Time", min: 20, max: 1200, step: 10, defaultValue: 320, unit: "ms" },
      { id: "feedback", name: "Feedback", min: 0, max: 95, step: 1, defaultValue: 45, unit: "%" },
      { id: "pingpong", name: "Ping Pong", min: 0, max: 1, step: 1, defaultValue: 1, unit: "on" },
      { id: "lowCut", name: "Delay Low Cut", min: 20, max: 800, step: 10, defaultValue: 120, unit: "Hz" },
      { id: "highCut", name: "Delay High Cut", min: 1000, max: 16000, step: 100, defaultValue: 6500, unit: "Hz" },
      { id: "wet", name: "Wet Level", min: 0, max: 100, step: 1, defaultValue: 40, unit: "%" },
      { id: "dry", name: "Dry Level", min: 0, max: 100, step: 1, defaultValue: 100, unit: "%" },
    ],
  },

  {
    id: "lsp-chorus",
    name: "LSP Stereo Chorus & Flanger",
    category: "Modulation",
    shortDesc: "Rich multi-voice chorus with stereophonic phase spread and modulation depth",
    detailedDesc:
      "Emulates bucket-brigade and digital stereo chorus units with adjustable LFO rate, delay depth, stereo offset, and regeneration feedback.",
    version: "1.2.35",
    githubUrl: "https://github.com/egidf/lsp-plugins.git",
    icon: "🌊",
    color: "#6366f1",
    params: [
      { id: "rate", name: "LFO Rate", min: 0.1, max: 8, step: 0.1, defaultValue: 1.4, unit: "Hz" },
      { id: "depth", name: "Chorus Depth", min: 0, max: 100, step: 1, defaultValue: 65, unit: "%" },
      { id: "phase", name: "Stereo Phase", min: 0, max: 180, step: 5, defaultValue: 90, unit: "°" },
      { id: "feedback", name: "Flange Feedback", min: 0, max: 85, step: 1, defaultValue: 15, unit: "%" },
      { id: "mix", name: "Wet Mix", min: 0, max: 100, step: 1, defaultValue: 55, unit: "%" },
    ],
  },

  {
    id: "lsp-impulse-reverb",
    name: "LSP Impulse Reverb",
    category: "Time & Delay",
    shortDesc: "High-definition acoustic room convolution and spatial impulse response reverb",
    detailedDesc:
      "Simulates pristine acoustic halls, rooms, plates, and churches. Includes pre-delay, decay duration, high frequency damping, and stereo wideness.",
    version: "1.2.35",
    githubUrl: "https://github.com/egidf/lsp-plugins.git",
    icon: "🏛️",
    color: "#14b8a6",
    params: [
      { id: "roomSize", name: "Room Size", min: 10, max: 100, step: 1, defaultValue: 65, unit: "%" },
      { id: "decay", name: "Decay Time", min: 0.2, max: 6.0, step: 0.1, defaultValue: 2.2, unit: "s" },
      { id: "predelay", name: "Pre-Delay", min: 0, max: 120, step: 2, defaultValue: 18, unit: "ms" },
      { id: "damping", name: "High Damping", min: 1000, max: 16000, step: 100, defaultValue: 7500, unit: "Hz" },
      { id: "wet", name: "Wet Mix", min: 0, max: 100, step: 1, defaultValue: 35, unit: "%" },
    ],
  },

  {
    id: "lsp-gate",
    name: "LSP Gate & Expander",
    category: "Dynamics",
    shortDesc: "Studio noise gate and downward expander with hold and hysteresis",
    detailedDesc:
      "Cleans up background hum, drum bleed, and room noise with fast attack, smooth release envelope, and customizable reduction range.",
    version: "1.2.35",
    githubUrl: "https://github.com/egidf/lsp-plugins.git",
    icon: "🚪",
    color: "#84cc16",
    params: [
      { id: "threshold", name: "Threshold", min: -60, max: 0, step: 1, defaultValue: -36, unit: "dB" },
      { id: "range", name: "Max Reduction", min: -60, max: 0, step: 1, defaultValue: -30, unit: "dB" },
      { id: "attack", name: "Attack Time", min: 0.1, max: 50, step: 0.5, defaultValue: 2, unit: "ms" },
      { id: "hold", name: "Hold Time", min: 1, max: 200, step: 2, defaultValue: 35, unit: "ms" },
      { id: "release", name: "Release Time", min: 10, max: 500, step: 5, defaultValue: 100, unit: "ms" },
    ],
  },

  {
    id: "lsp-clipper",
    name: "LSP Dynamic Clipper / Saturator",
    category: "Distortion & Saturation",
    shortDesc: "Overdrive, soft/hard clipper, and tube saturation processor",
    detailedDesc:
      "Harmonic saturation unit with adjustable wave shaping curves, knee rounding, drive amplification, and ceiling limit. Adds analog warmth or aggressive fuzz.",
    version: "1.2.35",
    githubUrl: "https://github.com/egidf/lsp-plugins.git",
    icon: "🔥",
    color: "#f97316",
    params: [
      { id: "drive", name: "Drive Boost", min: 0, max: 100, step: 1, defaultValue: 35, unit: "%" },
      { id: "knee", name: "Knee Softness", min: 0, max: 20, step: 0.5, defaultValue: 8, unit: "dB" },
      { id: "ceiling", name: "Ceiling Level", min: -12, max: 0, step: 0.5, defaultValue: -0.5, unit: "dB" },
      { id: "tone", name: "Tone Filter", min: 500, max: 16000, step: 100, defaultValue: 7000, unit: "Hz" },
      { id: "wet", name: "Mix", min: 0, max: 100, step: 1, defaultValue: 80, unit: "%" },
    ],
  },

  {
    id: "lsp-deesser",
    name: "LSP De-Esser",
    category: "Dynamics",
    shortDesc: "Frequency-selective dynamic suppressor for harsh sibilance",
    detailedDesc:
      "Tames harsh 's', 'sh', 't' sibilance on vocal tracks. Isolates high frequency energy and applies rapid dynamic reduction only when sibilant peaks exceed threshold.",
    version: "1.2.35",
    githubUrl: "https://github.com/egidf/lsp-plugins.git",
    icon: "🎙️",
    color: "#0ea5e9",
    params: [
      { id: "freq", name: "Detect Freq", min: 3000, max: 12000, step: 50, defaultValue: 6200, unit: "Hz" },
      { id: "bandwidth", name: "Bandwidth Q", min: 0.5, max: 4, step: 0.1, defaultValue: 1.8, unit: "" },
      { id: "threshold", name: "Threshold", min: -40, max: 0, step: 0.5, defaultValue: -22, unit: "dB" },
      { id: "reduction", name: "Max Cut", min: -20, max: 0, step: 0.5, defaultValue: -9, unit: "dB" },
    ],
  },

  {
    id: "lsp-phase-detector",
    name: "LSP Phase Detector & Goniometer",
    category: "Analyzers & Meters",
    shortDesc: "Stereo correlation meter, goniometer, and phase cancellation detector",
    detailedDesc:
      "Monitors stereo width and phase alignment. Displays correlation between Left and Right channels (+1 = pure mono, 0 = wide stereo, -1 = out of phase).",
    version: "1.2.35",
    githubUrl: "https://github.com/egidf/lsp-plugins.git",
    icon: "🧭",
    color: "#a855f7",
    params: [
      { id: "decaySpeed", name: "Needle Inertia", min: 1, max: 10, step: 1, defaultValue: 6, unit: "" },
      { id: "gain", name: "Meter Gain", min: 0.5, max: 3, step: 0.1, defaultValue: 1.2, unit: "x" },
    ],
  },
];
