import { useEffect, useLayoutEffect, useRef } from "react";
import type { Clip, Track } from "../types";
import { useStore, snapSeconds } from "../state/store";
import type { Snapshot } from "../state/store";
import { engine } from "../audio/engine";
import { drawWaveform } from "../audio/waveform";

/* ------------------------------------------------------------------ ruler */

function Ruler({ width, pxPerSec, tempo }: { width: number; pxPerSec: number; tempo: number }) {
  const spb = 60 / tempo;
  const beatPx = spb * pxPerSec;
  const loopEnabled = useStore((s) => s.loopEnabled);
  const loopStartBeat = useStore((s) => s.loopStartBeat);
  const loopEndBeat = useStore((s) => s.loopEndBeat);
  const setLoop = useStore((s) => s.setLoop);
  const setPos = (sec: number) => engine.setPos(sec);

  const ticks: React.ReactNode[] = [];
  const totalBeats = Math.ceil(width / beatPx) + 1;
  for (let b = 0; b < totalBeats; b++) {
    const x = b * beatPx;
    const isBar = b % 4 === 0;
    ticks.push(
      <div
        key={b}
        className={`tick ${isBar ? "" : "minor"}`}
        style={{ left: x, width: beatPx }}
      >
        {isBar ? Math.floor(b / 4) + 1 : ""}
      </div>,
    );
  }

  const dragRef = useRef<{ mode: "move" | "l" | "r"; startBeat: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent, mode: "seek" | "move" | "l" | "r") => {
    const el = e.currentTarget.parentElement as HTMLElement;
    const rect = el.getBoundingClientRect();
    const beat = (e.clientX - rect.left) / beatPx;
    if (mode === "seek") {
      setPos(Math.max(0, beat) * spb);
      return;
    }
    dragRef.current = { mode, startBeat: beat };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const el = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const beat = Math.max(0, (e.clientX - el.left) / beatPx);
    if (d.mode === "move") {
      const len = loopEndBeat - loopStartBeat;
      const nb = Math.max(0, Math.round(beat - (d.startBeat - loopStartBeat)));
      setLoop(true, nb, nb + len);
    } else if (d.mode === "l") {
      setLoop(true, Math.min(Math.round(beat), loopEndBeat - 1), loopEndBeat);
    } else {
      setLoop(true, loopStartBeat, Math.max(Math.round(beat), loopStartBeat + 1));
    }
  };

  const endDrag = () => (dragRef.current = null);

  return (
    <div
      className="ruler"
      style={{ width }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).classList.contains("handle")) return;
        if (loopEnabled) {
          const el = e.currentTarget.getBoundingClientRect();
          const beat = (e.clientX - el.left) / beatPx;
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
        // double click: enable a 4-bar loop starting at the clicked bar
        const el = e.currentTarget.getBoundingClientRect();
        const beat = Math.floor((e.clientX - el.left) / beatPx / 4) * 4;
        setLoop(true, beat, beat + 16);
      }}
    >
      {ticks}
      {loopEnabled && (
        <div
          className="loop-region"
          style={{ left: loopStartBeat * beatPx, width: (loopEndBeat - loopStartBeat) * beatPx }}
        >
          <div className="handle l" onPointerDown={(e) => onPointerDown(e, "l")} />
          <div className="handle r" onPointerDown={(e) => onPointerDown(e, "r")} />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ header */

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
  const armOnly = useStore((s) => s.armOnly);
  const selected = useStore((s) => s.selectedTrackId === track.id);
  const meterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const data = new Uint8Array(256);
    const loop = () => {
      const an = engine.getTrackAnalyser(track.id);
      if (meterRef.current) {
        if (an && engine.playing) {
          an.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length);
          meterRef.current.style.width = `${Math.min(100, rms * 260)}%`;
        } else {
          meterRef.current.style.width = "0%";
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [track.id]);

  return (
    <div
      className={`track-header ${selected ? "selected" : ""}`}
      onPointerDown={onSelect}
      onDragOver={(e) => e.preventDefault()}
    >
      <div className="row1">
        <span className="track-num">{String(index + 1).padStart(2, "0")}</span>
        <div className="color-bar" style={{ background: track.color }} />
        <input
          className="name"
          value={track.name}
          onChange={(e) => updateTrack(track.id, { name: e.target.value }, false)}
          onPointerDown={(e) => e.stopPropagation()}
        />
        <button
          className={`pill-btn m ${track.muted ? "on" : ""}`}
          title="Mute"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => updateTrack(track.id, { muted: !track.muted })}
        >
          M
        </button>
        <button
          className={`pill-btn s ${track.solo ? "on" : ""}`}
          title="Solo"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => updateTrack(track.id, { solo: !track.solo })}
        >
          S
        </button>
      </div>
      <div className="row1" style={{ gap: 5 }}>
        {track.kind === "audio" && (
          <button
            className={`pill-btn r ${track.armed ? "on" : ""}`}
            title="Arm for recording"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => armOnly(track.id)}
          >
            ●
          </button>
        )}
        <input
          className="mini-fader"
          type="range"
          min={0}
          max={1.2}
          step={0.01}
          value={track.volume}
          title={`Volume ${(track.volume * 100).toFixed(0)}%`}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => updateTrack(track.id, { volume: Number(e.target.value) }, false)}
        />
        <div
          style={{
            flex: 1,
            height: 3,
            background: "#0c0d10",
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <div ref={meterRef} style={{ height: "100%", width: 0, background: "var(--green)" }} />
        </div>
      </div>
      <div className="row1" style={{ gap: 5, color: "var(--muted-2)", fontSize: 9, fontWeight: 600 }}>
        <span>{track.kind === "audio" ? "MIC / LINE" : "INSTRUMENT"}</span>
        <span style={{ flex: 1 }} />
        <span>
          PAN {track.pan === 0 ? "C" : track.pan < 0 ? `L${Math.round(-track.pan * 100)}` : `R${Math.round(track.pan * 100)}`}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- clip */

function ClipView({ clip, pxPerSec, tempo }: { clip: Clip; pxPerSec: number; tempo: number }) {
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
      drawWaveform(canvasRef.current, buf, "rgba(255,255,255,0.75)", clip.offset, clip.duration);
    }
  }, [buf, clip.offset, clip.duration, clip.color]);

  const spb = 60 / tempo;
  const left = clip.start * pxPerSec;
  const width = Math.max(6, clip.duration * pxPerSec);

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
      const ns = Math.max(0, Math.min(snap(d.orig.start + dx), d.orig.start + d.orig.duration - spb * 0.25));
      const delta = ns - d.orig.start;
      updateClip(
        clip.id,
        { start: ns, duration: d.orig.duration - delta, offset: Math.max(0, d.orig.offset + delta) },
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
      className={`clip ${selected ? "selected" : ""}`}
      style={{
        left,
        width,
        background: `linear-gradient(180deg, ${clip.color}, ${clip.color}cc)`,
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
        <MidiPreview notes={clip.notes ?? []} width={width} lengthBeats={clip.lengthBeats ?? (clip.duration / spb)} />
      )}
      <div className="label">{clip.name}</div>
      <div className="trim l" onPointerDown={(e) => onPointerDown(e, "trim-l")} />
      <div className="trim r" onPointerDown={(e) => onPointerDown(e, "trim-r")} />
    </div>
  );
}

function MidiPreview({
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
    <div className="notes">
      {list.map((n) => (
        <div
          key={n.id}
          className="note-dot"
          style={{
            left: `${(n.start / lengthBeats) * 100}%`,
            width: Math.max(3, (n.duration / lengthBeats) * width),
            top: `${18 + ((max - n.pitch) / range) * 56}%`,
            opacity: 0.4 + n.velocity * 0.6,
          }}
        />
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- timeline */

export function Timeline() {
  const tracks = useStore((s) => s.tracks);
  const clips = useStore((s) => s.clips);
  const pxPerSec = useStore((s) => s.pxPerSec);
  const tempo = useStore((s) => s.tempo);
  const addTrack = useStore((s) => s.addTrack);
  const selectTrack = useStore((s) => s.selectTrack);
  const selectClip = useStore((s) => s.selectClip);
  const scrollRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);

  const endSec = clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0) + 12;
  const contentWidth = Math.max(900, endSec * pxPerSec);
  const beatPx = (60 / tempo) * pxPerSec;

  // playhead animation loop
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const pos = engine.pos;
      if (playheadRef.current) {
        playheadRef.current.style.transform = `translateX(${pos * pxPerSec}px)`;
      }
      // follow playhead
      const sc = scrollRef.current;
      if (sc && engine.playing) {
        const x = pos * pxPerSec;
        const viewL = sc.scrollLeft;
        const viewR = viewL + sc.clientWidth - 260;
        if (x > viewR - 80 || x < viewL) sc.scrollLeft = Math.max(0, x - 120);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [pxPerSec]);

  useLayoutEffect(() => {
    const sc = scrollRef.current;
    if (sc) sc.scrollLeft = 0;
  }, []);

  return (
    <div className="timeline-wrap">
      <div className="timeline-scroll" ref={scrollRef}>
        <div className="timeline-grid" style={{ width: `var(--header-w) + ${contentWidth}px` }}>
          <div className="corner">
            <span>Tracks ({tracks.length})</span>
            <span style={{ flex: 1 }} />
            <button
              className="icon-btn"
              title="Add track"
              onClick={() => addTrack("audio")}
              style={{ width: 20, height: 20 }}
            >
              +
            </button>
          </div>
          <Ruler width={contentWidth} pxPerSec={pxPerSec} tempo={tempo} />

          <div className="track-headers">
            {tracks.map((t, i) => (
              <TrackHeader key={t.id} track={t} index={i} onSelect={() => selectTrack(t.id)} />
            ))}
          </div>

          <div
            className="lanes"
            style={{ width: contentWidth, ["--beat-px" as string]: `${beatPx}px` }}
            onPointerDown={() => {
              selectClip(null);
              selectTrack(null);
            }}
          >
            {tracks.map((t) => (
              <div
                key={t.id}
                className={`lane ${t.armed ? "armed" : ""}`}
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
                  useStore.getState().addLoopClip(loop, t.id, snapSeconds(atSec, tempo, useStore.getState().snapDiv));
                }}
              >
                {clips
                  .filter((c) => c.trackId === t.id)
                  .map((c) => (
                    <ClipView key={c.id} clip={c} pxPerSec={pxPerSec} tempo={tempo} />
                  ))}
              </div>
            ))}
            <div className="playhead" ref={playheadRef} />
            {tracks.length === 0 && (
              <div className="empty-hint">
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>
                    Mulai sebuah project baru
                  </div>
                  <div>
                    Tambah track dari tombol <b>+</b> di transport, lalu seret loop dari panel kiri
                    ke timeline.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
