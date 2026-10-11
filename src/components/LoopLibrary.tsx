import { useMemo, useState } from "react";
import { LOOP_LIBRARY, LOOP_CATEGORIES } from "../audio/loops";
import { engine } from "../audio/engine";
import { useStore } from "../state/store";
import { INSTRUMENT_LABEL } from "../types";
import type { LoopDef } from "../types";

export function LoopLibrary() {
  const [cat, setCat] = useState<string>("All");
  const [q, setQ] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const addLoopClip = useStore((s) => s.addLoopClip);
  const addTrack = useStore((s) => s.addTrack);
  const showToast = useStore((s) => s.showToast);

  const loops = useMemo(
    () =>
      LOOP_LIBRARY.filter(
        (l) =>
          (cat === "All" || l.category === cat) &&
          l.name.toLowerCase().includes(q.toLowerCase()),
      ),
    [cat, q],
  );

  const preview = (loop: LoopDef) => {
    if (playingId === loop.id) {
      engine.stopPreview();
      setPlayingId(null);
      return;
    }
    engine.preview(loop);
    setPlayingId(loop.id);
  };

  const addTo = (loop: LoopDef) => {
    const s = useStore.getState();
    let trackId = s.selectedTrackId ?? s.tracks.find((t) => t.kind === "instrument")?.id;
    if (!trackId) {
      trackId = addTrack("instrument", loop.instrument);
    }
    const track = useStore.getState().tracks.find((t) => t.id === trackId);
    if (track && track.kind === "audio") {
      showToast("Track audio tidak bisa memuat MIDI loop — buat track instrument");
      return;
    }
    if (track && track.instrument !== loop.instrument) {
      useStore.getState().updateTrack(trackId, { instrument: loop.instrument });
    }
    addLoopClip(loop, trackId, engine.pos);
  };

  return (
    <div className="left-panel">
      <div className="panel-head">
        <h3>Loop Library</h3>
        <span style={{ color: "var(--muted-2)", fontSize: 10 }}>{loops.length} loops</span>
      </div>
      <div style={{ padding: "8px 10px 0" }}>
        <input
          className="project-name"
          style={{ width: "100%", minWidth: 0, background: "#0c0d10", borderColor: "var(--border)", fontSize: 11, padding: "5px 8px" }}
          placeholder="Search loops…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="cat-row">
        {["All", ...LOOP_CATEGORIES].map((c) => (
          <button
            key={c}
            className={`chip ${cat === c ? "active" : ""}`}
            onClick={() => setCat(c)}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="loop-list">
        {loops.map((loop) => (
          <div
            key={loop.id}
            className="loop-item"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("application/x-loop", JSON.stringify(loop));
              e.dataTransfer.effectAllowed = "copy";
            }}
            onDoubleClick={() => addTo(loop)}
            title="Seret ke timeline, atau double-click untuk tambah di playhead"
          >
            <div className="bar" style={{ background: loop.color }} />
            <button
              className="play"
              onClick={(e) => {
                e.stopPropagation();
                preview(loop);
              }}
            >
              {playingId === loop.id ? "■" : "▶"}
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="name">{loop.name}</div>
              <div className="meta">
                {loop.category} · {INSTRUMENT_LABEL[loop.instrument]} ·{" "}
                {loop.lengthBeats / 4} bar
              </div>
            </div>
            <button
              className="icon-btn"
              style={{ width: 22, height: 22 }}
              title="Tambah ke playhead"
              onClick={(e) => {
                e.stopPropagation();
                addTo(loop);
              }}
            >
              +
            </button>
          </div>
        ))}
        {loops.length === 0 && (
          <div style={{ color: "var(--muted)", textAlign: "center", padding: 20 }}>
            Tidak ada loop yang cocok
          </div>
        )}
        <div style={{ color: "var(--muted-2)", fontSize: 10, padding: "8px 4px", lineHeight: 1.5 }}>
          Tip: seret loop ke lane track, atau klik + untuk menyisipkan di posisi playhead.
        </div>
      </div>
    </div>
  );
}
