import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../state/store";
import type { Snapshot } from "../state/store";
import { engine } from "../audio/engine";
import { DRUM_NAMES } from "../types";
import type { Clip, MidiNote, Track } from "../types";

const ROW = 13;

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const pitchName = (p: number) => `${NOTE_NAMES[p % 12]}${Math.floor(p / 12) - 1}`;
const isBlack = (p: number) => [1, 3, 6, 8, 10].includes(p % 12);

export function PianoRoll() {
  const clip = useStore((s) => s.clips.find((c) => c.id === s.selectedClipId));
  const tracks = useStore((s) => s.tracks);
  const tempo = useStore((s) => s.tempo);
  const pxPerSec = useStore((s) => s.pxPerSec);
  const snapDiv = useStore((s) => s.snapDiv);
  const addNote = useStore((s) => s.addNote);
  const updateNote = useStore((s) => s.updateNote);
  const deleteNote = useStore((s) => s.deleteNote);
  const getSnapshot = useStore((s) => s.getSnapshot);
  const recordHistory = useStore((s) => s.recordHistory);

  const [selNote, setSelNote] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const keysRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevSnap = useRef<Snapshot | null>(null);

  const midiClip: Clip | undefined =
    clip?.kind === "midi"
      ? clip
      : useStore.getState().clips.find((c) => c.kind === "midi");
  const track: Track | undefined = tracks.find((t) => t.id === midiClip?.trackId);

  const notes = useMemo(() => midiClip?.notes ?? [], [midiClip]);
  const minPitch = Math.min(48, ...notes.map((n) => n.pitch)) - 1;
  const maxPitch = Math.max(72, ...notes.map((n) => n.pitch)) + 1;
  const rows = useMemo(() => {
    const arr: number[] = [];
    for (let p = maxPitch; p >= minPitch; p--) arr.push(p);
    return arr;
  }, [minPitch, maxPitch]);

  const spb = 60 / tempo;
  const beatPx = pxPerSec * spb;
  const lengthBeats = midiClip?.lengthBeats ?? (midiClip ? midiClip.duration / spb : 16);
  const gridW = Math.max(360, lengthBeats * beatPx);
  const gridH = rows.length * ROW;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if ((e.key === "Delete" || e.key === "Backspace") && selNote && midiClip) {
        e.preventDefault();
        deleteNote(midiClip.id, selNote);
        setSelNote(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selNote, midiClip, deleteNote]);

  if (!midiClip || !track) {
    return (
      <div className="bottom-panel">
        <div className="bottom-head">
          <h3>Piano Roll</h3>
        </div>
        <div style={{ padding: 24, color: "var(--muted)", textAlign: "center", fontSize: 12 }}>
          Pilih clip MIDI di timeline untuk membuka piano roll, atau seret loop dari library ke
          timeline.
        </div>
      </div>
    );
  }

  const snapB = (b: number) => Math.round(b / snapDiv) * snapDiv;

  const gridPos = (e: React.PointerEvent | PointerEvent) => {
    const rect = gridRef.current!.getBoundingClientRect();
    const beat = Math.max(0, (e.clientX - rect.left) / beatPx);
    const rowIdx = Math.floor((e.clientY - rect.top) / ROW);
    const pitch = maxPitch - rowIdx;
    return { beat, pitch };
  };

  const onGridDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).classList.contains("pr-note")) return;
    if (e.button !== 0) return;
    const { beat, pitch } = gridPos(e);
    if (pitch < minPitch || pitch > maxPitch) return;
    const note: Omit<MidiNote, "id"> = {
      pitch,
      start: snapB(beat),
      duration: Math.max(0.25, snapDiv),
      velocity: 0.9,
    };
    prevSnap.current = getSnapshot();
    addNote(midiClip.id, note);
    engine.audition(track.instrument, pitch, 0.35);
  };

  const onNoteDown = (e: React.PointerEvent, note: MidiNote, mode: "move" | "resize") => {
    e.stopPropagation();
    setSelNote(note.id);
    const startX = e.clientX;
    const startY = e.clientY;
    const orig = { ...note };
    prevSnap.current = getSnapshot();
    let lastPitch = orig.pitch;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);

    const move = (ev: PointerEvent) => {
      const dB = snapB((ev.clientX - startX) / beatPx);
      if (mode === "resize") {
        updateNote(midiClip.id, note.id, {
          duration: Math.max(snapDiv, orig.duration + dB),
        }, false);
      } else {
        const dRow = Math.round((ev.clientY - startY) / ROW);
        const pitch = Math.min(maxPitch, Math.max(minPitch, orig.pitch - dRow));
        if (pitch !== lastPitch) {
          lastPitch = pitch;
          engine.audition(track!.instrument, pitch, 0.25, 0.8);
        }
        updateNote(
          midiClip.id,
          note.id,
          { start: Math.max(0, orig.start + dB), pitch },
          false,
        );
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (prevSnap.current) recordHistory(prevSnap.current);
      prevSnap.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div className="bottom-panel">
      <div className="pr-clip-bar">
        <h3 style={{ margin: 0, fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", color: "var(--muted)", fontWeight: 700 }}>
          Piano Roll
        </h3>
        <span style={{ color: "var(--text)", fontWeight: 600 }}>{midiClip.name}</span>
        <span>{track.name}</span>
        <span>
          {lengthBeats} beats
        </span>
        <span style={{ flex: 1 }} />
        <span>Klik = tambah · drag = geser · drag ujung = resize · klik kanan = hapus</span>
      </div>
      <div className="piano-roll">
        <div className="pr-keys">
          <div ref={keysRef}>
            {rows.map((p) => (
              <div
                key={p}
                className={`pr-key ${isBlack(p) ? "black" : ""}`}
                onPointerDown={() => engine.audition(track.instrument, p, 0.4)}
              >
                {track.instrument === "drums"
                  ? DRUM_NAMES[p] ?? p
                  : p % 12 === 0 || isBlack(p)
                    ? pitchName(p)
                    : ""}
              </div>
            ))}
          </div>
        </div>
        <div
          className="pr-scroll"
          ref={scrollRef}
          onScroll={(e) => {
            if (keysRef.current) {
              keysRef.current.style.transform = `translateY(${-(e.target as HTMLElement).scrollTop}px)`;
            }
          }}
        >
          <div
            className="pr-content"
            ref={gridRef}
            style={{ width: gridW, height: gridH, ["--beat-px" as string]: `${beatPx}px` }}
            onPointerDown={onGridDown}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div className="pr-cell-lines" />
            {rows.map((p) => (
              <div
                key={p}
                className={`pr-row ${isBlack(p) ? "black" : ""} ${p % 12 === 0 ? "c" : ""}`}
              />
            ))}
            {notes.map((n) => (
              <div
                key={n.id}
                className={`pr-note ${selNote === n.id ? "selected" : ""}`}
                style={{
                  left: n.start * beatPx,
                  top: (maxPitch - n.pitch) * ROW + 1,
                  width: Math.max(5, n.duration * beatPx - 1),
                  opacity: 0.55 + n.velocity * 0.45,
                }}
                onPointerDown={(e) => onNoteDown(e, n, "move")}
                onContextMenu={(e) => {
                  e.preventDefault();
                  deleteNote(midiClip.id, n.id);
                }}
              >
                <div
                  className="resize"
                  onPointerDown={(e) => onNoteDown(e, n, "resize")}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
