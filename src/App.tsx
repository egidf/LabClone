import { useEffect } from "react";
import { TopBar } from "./components/TopBar";
import { TransportBar } from "./components/TransportBar";
import { LoopLibrary } from "./components/LoopLibrary";
import { Timeline } from "./components/Timeline";
import { MixerPanel } from "./components/Mixer";
import { EffectsPanel } from "./components/EffectsPanel";
import { MasteringPanel } from "./components/MasteringPanel";
import { PianoRoll } from "./components/PianoRoll";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useStore } from "./state/store";
import { engine } from "./audio/engine";
import { initTransport, playToggle, stopAll, toggleRecord } from "./state/transport";

function Statusbar() {
  const tracks = useStore((s) => s.tracks);
  const clips = useStore((s) => s.clips);
  const bpm = useStore((s) => s.tempo);
  const leftOpen = useStore((s) => s.leftPanelOpen);
  const panel = useStore((s) => s.bottomPanel);
  return (
    <div className="statusbar">
      <span>{tracks.length} tracks</span>
      <span>{clips.length} clips</span>
      <span>{bpm} BPM · 4/4</span>
      <span style={{ flex: 1 }} />
      <span>
        Space: play · R: record · Del: hapus clip · Ctrl+Z: undo · klik kanan clip: hapus
      </span>
      <span>{leftOpen ? "Loops ✓" : ""}</span>
      <span>{panel !== "none" ? panel : ""}</span>
    </div>
  );
}

export default function App() {
  const tracks = useStore((s) => s.tracks);
  const bottomPanel = useStore((s) => s.bottomPanel);
  const leftPanelOpen = useStore((s) => s.leftPanelOpen);
  const toast = useStore((s) => s.toast);

  // boot: engine <-> store wiring, seed starter tracks, shortcuts
  useEffect(() => {
    engine.getTracks = () => useStore.getState().tracks;
    engine.getClips = () => useStore.getState().clips;
    initTransport();
    engine.bpm = useStore.getState().tempo;

    const s = useStore.getState();
    if (s.tracks.length === 0) {
      s.addTrack("instrument", "drums");
      s.addTrack("instrument", "piano");
      s.addTrack("audio");
      useStore.setState({ selectedTrackId: useStore.getState().tracks[1].id });
    }

    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      const st = useStore.getState();
      if (e.code === "Space") {
        e.preventDefault();
        if (e.shiftKey) stopAll();
        else playToggle();
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        void toggleRecord();
      } else if ((e.key === "Delete" || e.key === "Backspace") && st.selectedClipId) {
        e.preventDefault();
        st.deleteClip(st.selectedClipId);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        st.redo();
      } else if ((e.key === "m" || e.key === "M") && st.selectedTrackId) {
        const t = st.tracks.find((x) => x.id === st.selectedTrackId);
        if (t) st.updateTrack(t.id, { muted: !t.muted });
      } else if ((e.key === "s" || e.key === "S") && st.selectedTrackId) {
        const t = st.tracks.find((x) => x.id === st.selectedTrackId);
        if (t) st.updateTrack(t.id, { solo: !t.solo });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    engine.syncTracks(tracks);
  }, [tracks]);

  return (
    <div className="app">
      <TopBar />
      <TransportBar />
      <div className="main">
        {leftPanelOpen && <LoopLibrary />}
        <Timeline />
      </div>
      {bottomPanel === "mixer" && (
        <div className="bottom-panel">
          <div className="bottom-head">
            <h3>Mixer</h3>
            <span style={{ color: "var(--muted)", fontSize: 11 }}>
              Fader, pan, mute/solo, EQ, compressor, reverb & delay send
            </span>
            <span className="spacer" />
            <button
              className="icon-btn"
              onClick={() => useStore.getState().setBottomPanel("none")}
            >
              ✕
            </button>
          </div>
          <MixerPanel />
        </div>
      )}
      {bottomPanel === "fx" && (
        <ErrorBoundary>
          <EffectsPanel />
        </ErrorBoundary>
      )}
      {bottomPanel === "mastering" && <MasteringPanel />}
      {bottomPanel === "piano" && <PianoRoll />}
      <Statusbar />
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
