import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Clip, Track } from "../types";
import { useStore, snapSeconds } from "../state/store";
import type { Snapshot } from "../state/store";
import { engine } from "../audio/engine";
import { drawWaveform } from "../audio/waveform";
import { RotaryKnob } from "./RotaryKnob";

/* ------------------------------------------------------------------ ruler */

function Ruler({
  width,
  pxPerSec,
  tempo,
  rulerRef,
  onSeek,
}: {
  width: number;
  pxPerSec: number;
  tempo: number;
  rulerRef: React.RefObject<HTMLDivElement>;
  onSeek: (sec: number) => void;
}) {
  const spb = 60 / tempo;
  const beatPx = spb * pxPerSec;
  const barPx = beatPx * 4;
  const loopEnabled = useStore((s) => s.loopEnabled);
  const loopStartBeat = useStore((s) => s.loopStartBeat);
  const loopEndBeat = useStore((s) => s.loopEndBeat);
  const setLoop = useStore((s) => s.setLoop);
  const snapDiv = useStore((s) => s.snapDiv);
  const setSnapDiv = useStore((s) => s.setSnapDiv);
  const setPxPerSec = useStore((s) => s.setPxPerSec);

  const totalBars = Math.ceil(width / barPx) + 4;
  const bars: React.ReactNode[] = [];
  for (let bar = 1; bar <= totalBars; bar++) {
    const x = (bar - 1) * barPx;
    bars.push(
      <div key={bar} className="ruler-bar-marker" style={{ left: x }}>
        <span className="ruler-bar-number">{bar}</span>
        <div className="ruler-subticks">
          <span style={{ left: beatPx }} />
          <span style={{ left: beatPx * 2 }} />
          <span style={{ left: beatPx * 3 }} />
        </div>
      </div>,
    );
  }

  const dragRef = useRef<{ mode: "seek" | "move" | "l" | "r"; startBeat: number } | null>(null);

  const calcBeatFromClientX = (clientX: number) => {
    if (!rulerRef.current) return 0;
    const rect = rulerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    return Math.max(0, x / beatPx);
  };

  const onPointerDown = (e: React.PointerEvent, mode: "seek" | "move" | "l" | "r") => {
    const beat = calcBeatFromClientX(e.clientX);
    if (mode === "seek") {
      const isFree = e.shiftKey || e.altKey;
      const snappedBeat = !isFree && snapDiv > 0 ? Math.round(beat / snapDiv) * snapDiv : beat;
      onSeek(Math.max(0, snappedBeat) * spb);
      dragRef.current = { mode: "seek", startBeat: beat };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
    dragRef.current = { mode, startBeat: beat };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const beat = calcBeatFromClientX(e.clientX);
    if (d.mode === "seek") {
      // Smooth continuous scrubbing when dragging ruler, snap only if Ctrl pressed
      const isFree = !e.ctrlKey;
      const snappedBeat = !isFree && snapDiv > 0 ? Math.round(beat / snapDiv) * snapDiv : beat;
      onSeek(Math.max(0, snappedBeat) * spb);
    } else if (d.mode === "move") {
      const len = loopEndBeat - loopStartBeat;
      const nb = Math.max(0, Math.round(beat - (d.startBeat - loopStartBeat)));
      setLoop(true, nb, nb + len);
    } else if (d.mode === "l") {
      setLoop(true, Math.min(Math.round(beat), loopEndBeat - 1), loopEndBeat);
    } else {
      setLoop(true, loopStartBeat, Math.max(Math.round(beat), loopStartBeat + 1));
    }
  };

  const endDrag = (e: React.PointerEvent) => {
    if (dragRef.current) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
    dragRef.current = null;
  };

  return (
    <div
      ref={rulerRef}
      className="bandlab-ruler"
      style={{ width }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).classList.contains("handle")) return;
        if (loopEnabled) {
          const beat = calcBeatFromClientX(e.clientX);
          if (beat >= loopStartBeat && beat <= loopEndBeat) {
            onPointerDown(e, "move");
            return;
          }
        }
        onPointerDown(e, "seek");
      }}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={(e) => {
        const beat = calcBeatFromClientX(e.clientX);
        const barIdx = Math.floor(beat / 4);
        setLoop(true, barIdx * 4, barIdx * 4 + 16);
      }}
    >
      {bars}

      {/* Red loop banner spanning loop bars */}
      {loopEnabled && (
        <div
          className="ruler-loop-region"
          style={{
            left: loopStartBeat * beatPx,
            width: Math.max(12, (loopEndBeat - loopStartBeat) * beatPx),
          }}
        >
          <div className="handle l" onPointerDown={(e) => onPointerDown(e, "l")} />
          <span className="loop-tag">CYCLE LOOP ({Math.round(loopEndBeat - loopStartBeat)} BEATS)</span>
          <div className="handle r" onPointerDown={(e) => onPointerDown(e, "r")} />
        </div>
      )}

      {/* Floating ruler tools on far right */}
      <div className="ruler-tools-dock">
        <button
          className={`ruler-tool-btn ${snapDiv > 0 ? "active" : ""}`}
          title={snapDiv > 0 ? `Snap: 1/16 Beat (Active)` : `Snap: Off (Free)`}
          onClick={() => setSnapDiv(snapDiv > 0 ? 0 : 0.25)}
        >
          🧲 {snapDiv > 0 ? "Snap On" : "Snap Off"}
        </button>
        <button
          className="ruler-tool-btn"
          title="Zoom Out"
          onClick={() => setPxPerSec(Math.max(15, pxPerSec / 1.25))}
        >
          🔍−
        </button>
        <button
          className="ruler-tool-btn"
          title="Zoom In"
          onClick={() => setPxPerSec(Math.min(180, pxPerSec * 1.25))}
        >
          🔍+
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ track header */

function TrackHeader({
  track,
  index,
  onSelect,
}: {
  track: Track;
  index: number;
  onSelect: () => void;
}) {
  const updateTrack = useStore((s) => s.updateTrack);
  const deleteTrack = useStore((s) => s.deleteTrack);
  const armOnly = useStore((s) => s.armOnly);
  const selected = useStore((s) => s.selectedTrackId === track.id);
  const setBottomPanel = useStore((s) => s.setBottomPanel);
  const [showMenu, setShowMenu] = useState(false);
  const meterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const data = new Uint8Array(128);
    const loop = () => {
      const an = engine.getTrackAnalyser(track.id);
      if (meterRef.current) {
        if (an && engine.playing && !track.muted) {
          an.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length);
          meterRef.current.style.height = `${Math.min(100, rms * 280)}%`;
        } else {
          meterRef.current.style.height = "0%";
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [track.id, track.muted]);

  const numLabel = String(index + 1).padStart(2, "0");

  return (
    <div
      className={`bandlab-track-header ${selected ? "selected" : ""}`}
      style={{ borderLeftColor: track.color }}
      onPointerDown={onSelect}
      onDragOver={(e) => e.preventDefault()}
    >
      {/* Top row: Track Icon/Number + Name + Mute / Solo / Menu */}
      <div className="header-top-row">
        <div className="track-title-block">
          <div className="track-icon-badge" style={{ backgroundColor: `${track.color}25`, color: track.color }}>
            {track.kind === "audio" ? "🎙️" : "🎹"}
          </div>
          <span className="track-index-num">{numLabel}</span>
          <input
            className="track-name-input"
            value={track.name}
            onChange={(e) => updateTrack(track.id, { name: e.target.value }, false)}
            onPointerDown={(e) => e.stopPropagation()}
            title="Click to rename track"
          />
        </div>

        <div className="header-actions-block">
          <button
            className={`btn-track-badge ${track.muted ? "on-muted" : ""}`}
            title="Mute Track (M)"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => updateTrack(track.id, { muted: !track.muted })}
          >
            M
          </button>
          <button
            className={`btn-track-badge ${track.solo ? "on-solo" : ""}`}
            title="Solo Track (S)"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => updateTrack(track.id, { solo: !track.solo })}
          >
            S
          </button>
          <button
            className="btn-track-menu"
            title="Track Options"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setShowMenu(!showMenu)}
          >
            ⋮
          </button>
        </div>
      </div>

      {/* Middle row: FX Custom button & Arm record badge */}
      <div className="header-sub-row">
        <button
          className="fx-custom-badge"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            onSelect();
            setBottomPanel("fx");
          }}
          title="Open Track Effects Rack"
        >
          <span className="fx-text">🎛️ Fx Custom</span>
        </button>

        {track.kind === "audio" && (
          <button
            className={`arm-rec-pill ${track.armed ? "armed" : ""}`}
            title={track.armed ? "Armed for recording (Active)" : "Arm track for recording (R)"}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => armOnly(track.id)}
          >
            ● {track.armed ? "REC ON" : "REC"}
          </button>
        )}
      </div>

      {/* Bottom row: Volume Slider & Rotary Pan knob & VU Meter */}
      <div className="header-controls-row">
        <div className="track-vol-slider-wrap">
          <div className="vol-slider-label-row">
            <span className="vol-slider-label">VOL</span>
            <span className="vol-slider-pct">{Math.round((track.volume / 1.2) * 100)}%</span>
          </div>
          <input
            className="track-h-fader"
            type="range"
            min={0}
            max={1.2}
            step={0.01}
            value={track.volume}
            style={{
              background: `linear-gradient(to right, ${track.color} ${(track.volume / 1.2) * 100}%, rgba(255,255,255,0.1) ${(track.volume / 1.2) * 100}%)`,
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) => updateTrack(track.id, { volume: Number(e.target.value) }, false)}
          />
        </div>

        {/* Pan Knob (Enlarged 40px with clear L/C/R indicator) */}
        <div className="track-pan-knob-container" onPointerDown={(e) => e.stopPropagation()}>
          <RotaryKnob
            value={track.pan}
            min={-1}
            max={1}
            step={0.02}
            defaultValue={0}
            bipolar
            size={40}
            color="#38bdf8"
            showValue={true}
            valueFormat={(v) =>
              Math.abs(v) < 0.03 ? "C" : v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`
            }
            onChange={(v) => updateTrack(track.id, { pan: v }, false)}
          />
        </div>

        {/* Mini VU bar */}
        <div className="track-mini-meter" title="Signal Level">
          <div ref={meterRef} className="meter-fill" style={{ background: track.color }} />
        </div>
      </div>

      {/* Dropdown menu */}
      {showMenu && (
        <div className="track-dropdown-menu" onPointerDown={(e) => e.stopPropagation()}>
          <div
            className="menu-item"
            onClick={() => {
              onSelect();
              setBottomPanel("instrument");
              setShowMenu(false);
            }}
          >
            🎹 Open Instrument
          </div>
          <div
            className="menu-item"
            onClick={() => {
              onSelect();
              setBottomPanel("fx");
              setShowMenu(false);
            }}
          >
            🎛️ Open Effects
          </div>
          <div
            className="menu-item"
            onClick={() => {
              onSelect();
              setBottomPanel("piano");
              setShowMenu(false);
            }}
          >
            🎼 MIDI Piano Roll
          </div>
          <div
            className="menu-item danger"
            onClick={() => {
              deleteTrack(track.id);
              setShowMenu(false);
            }}
          >
            🗑 Delete Track
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- clip */

function ClipView({
  clip,
  pxPerSec,
  tempo,
}: {
  clip: Clip;
  pxPerSec: number;
  tempo: number;
}) {
  const updateClip = useStore((s) => s.updateClip);
  const selectClip = useStore((s) => s.selectClip);
  const deleteClip = useStore((s) => s.deleteClip);
  const getSnapshot = useStore((s) => s.getSnapshot);
  const recordHistory = useStore((s) => s.recordHistory);
  const selected = useStore((s) => s.selectedClipId === clip.id);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{
    mode: "move" | "trim-l" | "trim-r";
    startX: number;
    orig: Clip;
    prevSnapshot: Snapshot;
    moved: boolean;
  } | null>(null);

  const buf = clip.bufferId ? engine.buffers.get(clip.bufferId) : undefined;

  useEffect(() => {
    if (canvasRef.current && buf) {
      drawWaveform(canvasRef.current, buf, "rgba(255,255,255,0.85)", clip.offset, clip.duration);
    }
  }, [buf, clip.offset, clip.duration, clip.color]);

  const spb = 60 / tempo;
  const left = clip.start * pxPerSec;
  const width = Math.max(12, clip.duration * pxPerSec);

  const onPointerDown = (e: React.PointerEvent, mode: "move" | "trim-l" | "trim-r") => {
    e.stopPropagation();
    selectClip(clip.id);
    drag.current = {
      mode,
      startX: e.clientX,
      orig: { ...clip },
      prevSnapshot: getSnapshot(),
      moved: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.startX) > 2) d.moved = true;
    const dx = (e.clientX - d.startX) / pxPerSec;
    const snap = (sec: number) => snapSeconds(sec, tempo, useStore.getState().snapDiv);
    if (d.mode === "move") {
      updateClip(clip.id, { start: Math.max(0, snap(d.orig.start + dx)) }, false);
    } else if (d.mode === "trim-r") {
      const dur = Math.max(spb * 0.25, snap(d.orig.duration + dx));
      const maxDur = buf ? buf.duration - d.orig.offset : dur;
      updateClip(clip.id, { duration: Math.min(dur, maxDur) }, false);
    } else {
      const ns = Math.max(
        0,
        Math.min(snap(d.orig.start + dx), d.orig.start + d.orig.duration - spb * 0.25),
      );
      const delta = ns - d.orig.start;
      updateClip(
        clip.id,
        {
          start: ns,
          duration: d.orig.duration - delta,
          offset: Math.max(0, d.orig.offset + delta),
        },
        false,
      );
    }
  };

  const onPointerUp = () => {
    const d = drag.current;
    if (d && d.moved) recordHistory(d.prevSnapshot);
    drag.current = null;
  };

  return (
    <div
      className={`bandlab-clip ${selected ? "selected" : ""}`}
      style={{
        left,
        width,
        backgroundColor: clip.color,
      }}
      onPointerDown={(e) => onPointerDown(e, "move")}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={(e) => {
        e.preventDefault();
        deleteClip(clip.id);
      }}
    >
      {buf && <canvas ref={canvasRef} />}
      {clip.kind === "midi" && (
        <MidiNotesVisualizer
          notes={clip.notes ?? []}
          width={width}
          lengthBeats={clip.lengthBeats ?? clip.duration / spb}
        />
      )}
      <div className="clip-label">{clip.name}</div>
      <div className="trim l" onPointerDown={(e) => onPointerDown(e, "trim-l")} title="Trim Start" />
      <div className="trim r" onPointerDown={(e) => onPointerDown(e, "trim-r")} title="Trim End" />
    </div>
  );
}

function MidiNotesVisualizer({
  notes,
  width,
  lengthBeats,
}: {
  notes: Clip["notes"];
  width: number;
  lengthBeats: number;
}) {
  const list = notes ?? [];
  if (!list.length) return null;
  const pitches = list.map((n) => n.pitch);
  const min = Math.min(...pitches);
  const max = Math.max(...pitches);
  const range = Math.max(1, max - min);

  return (
    <div className="bandlab-midi-notes-canvas">
      {list.map((n) => {
        const leftPct = (n.start / lengthBeats) * 100;
        const widthPx = Math.max(4, (n.duration / lengthBeats) * width);
        const topPct = 12 + ((max - n.pitch) / range) * 60;
        return (
          <div
            key={n.id}
            className="midi-bar-pip"
            style={{
              left: `${leftPct}%`,
              width: widthPx,
              top: `${topPct}%`,
              opacity: 0.65 + n.velocity * 0.35,
            }}
          />
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------- timeline */

export function Timeline() {
  const tracks = useStore((s) => s.tracks);
  const clips = useStore((s) => s.clips);
  const pxPerSec = useStore((s) => s.pxPerSec);
  const tempo = useStore((s) => s.tempo);
  const snapDiv = useStore((s) => s.snapDiv);
  const addTrack = useStore((s) => s.addTrack);
  const selectTrack = useStore((s) => s.selectTrack);
  const selectClip = useStore((s) => s.selectClip);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const playheadBadgeRef = useRef<HTMLDivElement>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [extraBars, setExtraBars] = useState(0);

  const spb = 60 / tempo;
  const barPx = spb * 4 * pxPerSec;

  // Generous track length: default 256 bars (~8.5 minutes at 120 BPM), expandable with extraBars
  const furthestClipSec = clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
  const furthestClipBar = Math.ceil(furthestClipSec / (spb * 4));
  const playheadBar = Math.ceil(engine.pos / (spb * 4));
  const totalBars = Math.max(256 + extraBars, furthestClipBar + 32, playheadBar + 16);
  const contentWidth = totalBars * barPx;

  const isScrubbingRef = useRef(false);
  const [isScrubbing, setIsScrubbing] = useState(false);

  const seekTo = (sec: number) => {
    engine.setPos(sec);
    if (playheadRef.current) {
      playheadRef.current.style.transform = `translateX(${sec * pxPerSec}px)`;
    }
  };

  const handlePlayheadPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    isScrubbingRef.current = true;
    setIsScrubbing(true);
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);

    const onPointerMove = (ev: PointerEvent) => {
      if (!isScrubbingRef.current || !rulerRef.current) return;
      const rect = rulerRef.current.getBoundingClientRect();
      const rawSec = Math.max(0, (ev.clientX - rect.left) / pxPerSec);
      // Continuous smooth scrub by default; hold Ctrl to snap
      const isFree = !ev.ctrlKey;
      const finalSec = !isFree && snapDiv > 0 ? snapSeconds(rawSec, tempo, snapDiv) : rawSec;
      seekTo(finalSec);
      if (playheadBadgeRef.current) {
        const barNum = Math.floor(finalSec / (spb * 4)) + 1;
        const beatNum = Math.floor((finalSec % (spb * 4)) / spb) + 1;
        playheadBadgeRef.current.textContent = `${barNum}.${beatNum}`;
      }
    };

    const onPointerUp = (ev: PointerEvent) => {
      isScrubbingRef.current = false;
      setIsScrubbing(false);
      try {
        target.releasePointerCapture(ev.pointerId);
      } catch {}
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  // 60 FPS playhead tracking loop
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const pos = engine.pos;
      const x = pos * pxPerSec;

      if (!isScrubbingRef.current) {
        if (playheadRef.current) {
          playheadRef.current.style.transform = `translateX(${x}px)`;
        }

        if (playheadBadgeRef.current) {
          const barNum = Math.floor(pos / (spb * 4)) + 1;
          const beatNum = Math.floor((pos % (spb * 4)) / spb) + 1;
          playheadBadgeRef.current.textContent = `${barNum}.${beatNum}`;
        }
      }

      const sc = scrollRef.current;
      if (sc && engine.playing) {
        const viewL = sc.scrollLeft;
        const viewR = viewL + sc.clientWidth - 280;
        if (x > viewR - 100 || x < viewL) {
          sc.scrollLeft = Math.max(0, x - 120);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [pxPerSec, spb]);

  useLayoutEffect(() => {
    const sc = scrollRef.current;
    if (sc) sc.scrollLeft = 0;
  }, []);

  return (
    <div className="bandlab-timeline-container">
      <div className="bandlab-timeline-scroll" ref={scrollRef}>
        <div
          className="bandlab-timeline-grid"
          style={{ width: `calc(var(--header-w) + ${contentWidth}px)` }}
        >
          {/* Top-Left Corner: + Add Track Button */}
          <div className="track-list-corner">
            <button
              className="btn-add-track-pill"
              onClick={() => setAddMenuOpen(!addMenuOpen)}
            >
              <span className="plus-icon">+</span>
              <span>Add Track</span>
            </button>

            <div className="corner-quick-icons">
              <button
                className="corner-btn-text"
                title="Extend song by 64 bars"
                onClick={() => setExtraBars((b) => b + 64)}
              >
                +64 Bars
              </button>
            </div>

            {addMenuOpen && (
              <div className="add-track-dropdown" onPointerDown={(e) => e.stopPropagation()}>
                <div
                  className="add-option-row"
                  onClick={() => {
                    addTrack("instrument", "piano");
                    setAddMenuOpen(false);
                  }}
                >
                  <span className="opt-icon">🎹</span>
                  <div>
                    <div className="opt-name">Studio Grand / Keys</div>
                    <div className="opt-sub">Virtual Instrument (MIDI)</div>
                  </div>
                </div>

                <div
                  className="add-option-row"
                  onClick={() => {
                    addTrack("audio");
                    setAddMenuOpen(false);
                  }}
                >
                  <span className="opt-icon">🎙️</span>
                  <div>
                    <div className="opt-name">Voice / Audio</div>
                    <div className="opt-sub">Microphone & audio recording</div>
                  </div>
                </div>

                <div
                  className="add-option-row"
                  onClick={() => {
                    addTrack("instrument", "drums");
                    setAddMenuOpen(false);
                  }}
                >
                  <span className="opt-icon">🥁</span>
                  <div>
                    <div className="opt-name">Drum Kit / Machine</div>
                    <div className="opt-sub">Electronic & acoustic drums</div>
                  </div>
                </div>

                <div
                  className="add-option-row"
                  onClick={() => {
                    addTrack("instrument", "bass");
                    setAddMenuOpen(false);
                  }}
                >
                  <span className="opt-icon">🎸</span>
                  <div>
                    <div className="opt-name">Bass</div>
                    <div className="opt-sub">808 & synthetic bass</div>
                  </div>
                </div>

                <div
                  className="add-option-row"
                  onClick={() => {
                    addTrack("instrument", "pad");
                    setAddMenuOpen(false);
                  }}
                >
                  <span className="opt-icon">✨</span>
                  <div>
                    <div className="opt-name">Warm Pad / Chords</div>
                    <div className="opt-sub">Atmospheric synth pad</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Timeline Ruler */}
          <Ruler
            width={contentWidth}
            pxPerSec={pxPerSec}
            tempo={tempo}
            rulerRef={rulerRef}
            onSeek={seekTo}
          />

          {/* Left Track Headers Column */}
          <div className="bandlab-track-column">
            {tracks.map((t, i) => (
              <TrackHeader
                key={t.id}
                track={t}
                index={i}
                onSelect={() => selectTrack(t.id)}
              />
            ))}
          </div>

          {/* Right Arrangement Lanes Area */}
          <div
            className="bandlab-lanes-area"
            style={{
              width: contentWidth,
              ["--bar-px" as string]: `${barPx}px`,
            }}
            onPointerDown={(e) => {
              const target = e.target as HTMLElement;
              // If click was not on a clip or button or input, seek playhead directly!
              if (!target.closest(".bandlab-clip") && !target.closest("button") && !target.closest("input")) {
                const rect = e.currentTarget.getBoundingClientRect();
                const atSec = Math.max(0, (e.clientX - rect.left) / pxPerSec);
                const snapped = snapDiv > 0 ? snapSeconds(atSec, tempo, snapDiv) : atSec;
                seekTo(snapped);
                selectClip(null);
                selectTrack(null);
              }
            }}
          >
            {tracks.map((t) => (
              <div
                key={t.id}
                className={`bandlab-lane ${t.armed ? "armed" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.add("dragover");
                }}
                onDragLeave={(e) => e.currentTarget.classList.remove("dragover")}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove("dragover");
                  const data = e.dataTransfer.getData("application/x-loop");
                  if (!data) return;
                  const loop = JSON.parse(data);
                  const rect = e.currentTarget.getBoundingClientRect();
                  const atSec = Math.max(0, (e.clientX - rect.left) / pxPerSec);
                  useStore
                    .getState()
                    .addLoopClip(
                      loop,
                      t.id,
                      snapSeconds(atSec, tempo, useStore.getState().snapDiv),
                    );
                }}
              >
                {clips
                  .filter((c) => c.trackId === t.id)
                  .map((c) => (
                    <ClipView
                      key={c.id}
                      clip={c}
                      pxPerSec={pxPerSec}
                      tempo={tempo}
                    />
                  ))}
              </div>
            ))}

            {/* Song End Flag Marker */}
            <div
              className="song-end-boundary-marker"
              style={{ left: contentWidth - 2 }}
            >
              <span className="end-label">END OF SONG ({totalBars} BARS)</span>
            </div>

            {tracks.length === 0 && (
              <div className="empty-hint">
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>
                    No tracks in project
                  </div>
                  <div style={{ color: "var(--muted)", marginTop: 6 }}>
                    Click <strong>+ Add Track</strong> above or drag a loop from BandLab Sounds.
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Unified Playhead: Scrubber Head in Ruler + Vertical Glowing Beam across All Tracks */}
          <div
            className={`bandlab-playhead-unified ${isScrubbing ? "is-scrubbing" : ""}`}
            ref={playheadRef}
          >
            <div
              className={`playhead-scrubber-handle ${isScrubbing ? "grabbing" : ""}`}
              title="Drag to scrub playhead smoothly (Ctrl to snap)"
              onPointerDown={handlePlayheadPointerDown}
            >
              <span className="playhead-badge-text" ref={playheadBadgeRef}>1.1</span>
              <span className="playhead-down-arrow">▼</span>
            </div>
            <div
              className="playhead-vertical-needle"
              title="Drag playhead needle to scrub"
              onPointerDown={handlePlayheadPointerDown}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
