import { useEffect, useRef } from "react";
import { useStore } from "../state/store";
import type { Snapshot } from "../state/store";
import { engine } from "../audio/engine";
import type { Track } from "../types";

function Meter({ analyser }: { analyser: AnalyserNode | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const data = new Uint8Array(256);
    const loop = () => {
      if (ref.current) {
        if (analyser && engine.playing) {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          ref.current.style.height = `${Math.min(100, Math.sqrt(sum / data.length) * 240)}%`;
        } else {
          ref.current.style.height = "0%";
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [analyser]);
  return (
    <div className="meter">
      <div className="fill" ref={ref} />
    </div>
  );
}

function Strip({ track }: { track: Track }) {
  const updateTrack = useStore((s) => s.updateTrack);
  const selectTrack = useStore((s) => s.selectTrack);
  const selected = useStore((s) => s.selectedTrackId === track.id);
  const getSnapshot = useStore((s) => s.getSnapshot);
  const recordHistory = useStore((s) => s.recordHistory);
  const prev = useRef<Snapshot | null>(null);

  return (
    <div
      className="channel-strip"
      style={selected ? { borderColor: track.color } : undefined}
      onPointerDown={() => selectTrack(track.id)}
    >
      <div className="ch-name" style={{ color: track.color }}>
        {track.name}
      </div>
      <div className="fader-row">
        <Meter analyser={engine.getTrackAnalyser(track.id)} />
        <input
          className="v-fader"
          type="range"
          min={0}
          max={1.2}
          step={0.01}
          value={track.volume}
          title="Volume"
          onPointerDown={() => (prev.current = getSnapshot())}
          onPointerUp={() => {
            if (prev.current) recordHistory(prev.current);
            prev.current = null;
          }}
          onChange={(e) => updateTrack(track.id, { volume: Number(e.target.value) }, false)}
        />
      </div>
      <div className="strip-value">
        {Math.round((track.volume / 1.2) * 100)}
      </div>
      <div className="pan-row">
        <span>Pan</span>
        <input
          type="range"
          min={-1}
          max={1}
          step={0.01}
          value={track.pan}
          onChange={(e) => updateTrack(track.id, { pan: Number(e.target.value) }, false)}
          onPointerDown={() => (prev.current = getSnapshot())}
          onPointerUp={() => {
            if (prev.current) recordHistory(prev.current);
            prev.current = null;
          }}
        />
      </div>
      <div className="ch-buttons">
        <button
          className={`pill-btn m ${track.muted ? "on" : ""}`}
          onClick={() => updateTrack(track.id, { muted: !track.muted })}
        >
          M
        </button>
        <button
          className={`pill-btn s ${track.solo ? "on" : ""}`}
          onClick={() => updateTrack(track.id, { solo: !track.solo })}
        >
          S
        </button>
        {track.kind === "audio" && (
          <button
            className={`pill-btn r ${track.armed ? "on" : ""}`}
            title="Arm record"
            onClick={() => useStore.getState().armOnly(track.id)}
          >
            ●
          </button>
        )}
        <button
          className="pill-btn"
          title="Hapus track"
          onClick={() => useStore.getState().deleteTrack(track.id)}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function MasterStrip() {
  return (
    <div className="channel-strip master-strip">
      <div className="ch-name">MASTER</div>
      <div className="fader-row">
        <Meter analyser={engine.masterAnalyser} />
        <input
          className="v-fader"
          type="range"
          min={0}
          max={1}
          step={0.01}
          defaultValue={0.95}
          title="Master Volume"
          onChange={() => {}}
        />
      </div>
      <div className="strip-value">95</div>
      <div className="pan-row">
        <span>STEREO</span>
      </div>
      <div className="ch-buttons">
        <span style={{ color: "var(--muted)", fontSize: 9, fontWeight: 700 }}>LIMITER</span>
      </div>
    </div>
  );
}

function FxCard() {
  const track = useStore((s) => s.tracks.find((t) => t.id === s.selectedTrackId));
  const updateTrack = useStore((s) => s.updateTrack);
  if (!track)
    return (
      <div style={{ color: "var(--muted)", padding: 14, fontSize: 11 }}>
        Pilih track untuk mengatur effects (EQ, compressor, reverb & delay send).
      </div>
    );
  const fx = track.effects;
  return (
    <div className="fx-grid">
      <div className="fx-card">
        <h4>EQ · {track.name}</h4>
        {(["eqLow", "eqMid", "eqHigh"] as const).map((k) => (
          <div className="slider-row" key={k}>
            <span>{k === "eqLow" ? "Low" : k === "eqMid" ? "Mid" : "High"}</span>
            <input
              type="range"
              min={-24}
              max={24}
              step={0.5}
              value={fx[k]}
              onChange={(e) =>
                updateTrack(track.id, { effects: { ...fx, [k]: Number(e.target.value) } }, false)
              }
            />
            <span className="val">{fx[k] > 0 ? "+" : ""}{fx[k]} dB</span>
          </div>
        ))}
      </div>
      <div className="fx-card">
        <h4>Processor</h4>
        <div className="slider-row">
          <span>Comp</span>
          <button
            className={`toggle ${fx.compress ? "on" : ""}`}
            onClick={() =>
              updateTrack(track.id, { effects: { ...fx, compress: !fx.compress } })
            }
          >
            {fx.compress ? "ON" : "OFF"}
          </button>
        </div>
        <div className="slider-row">
          <span>Rev</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={track.reverbSend}
            onChange={(e) =>
              updateTrack(track.id, { reverbSend: Number(e.target.value) }, false)
            }
          />
          <span className="val">{Math.round(track.reverbSend * 100)}%</span>
        </div>
        <div className="slider-row">
          <span>Dly</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={track.delaySend}
            onChange={(e) =>
              updateTrack(track.id, { delaySend: Number(e.target.value) }, false)
            }
          />
          <span className="val">{Math.round(track.delaySend * 100)}%</span>
        </div>
      </div>
    </div>
  );
}

export function MixerPanel() {
  const tracks = useStore((s) => s.tracks);
  return (
    <div style={{ display: "flex", flex: "column", minHeight: 0 }}>
      <div className="mixer">
        {tracks.map((t) => (
          <Strip key={t.id} track={t} />
        ))}
        <MasterStrip />
      </div>
      <FxCard />
    </div>
  );
}
