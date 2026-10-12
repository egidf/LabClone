import { useEffect } from "react";
import { TopBar } from "./components/TopBar";
import { LoopLibrary } from "./components/LoopLibrary";
import { Timeline } from "./components/Timeline";
import { MixerPanel } from "./components/Mixer";
import { EffectsPanel } from "./components/EffectsPanel";
import { InstrumentPanel } from "./components/InstrumentPanel";
import { MasteringDrawer } from "./components/MasteringDrawer";
import { MasteringPanel } from "./components/MasteringPanel";
import { PianoRoll } from "./components/PianoRoll";
import { BottomDock } from "./components/BottomDock";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LspPluginsSuite } from "./components/LspPluginsSuite";
import { useStore } from "./state/store";
import { engine } from "./audio/engine";
import { initTransport, playToggle, stopAll, toggleRecord } from "./state/transport";
import { LOOP_LIBRARY } from "./audio/loops";

export default function App() {
  const tracks = useStore((s) => s.tracks);
  const bottomPanel = useStore((s) => s.bottomPanel);
  const leftPanelOpen = useStore((s) => s.leftPanelOpen);
  const masteringOpen = useStore((s) => s.masteringOpen);
  const toast = useStore((s) => s.toast);

  // boot: engine <-> store wiring, seed starter tracks, shortcuts
  useEffect(() => {
    engine.getTracks = () => useStore.getState().tracks;
    engine.getClips = () => useStore.getState().clips;
    initTransport();
    engine.bpm = useStore.getState().tempo;

    const s = useStore.getState();
    if (s.tracks.length === 0) {
      // Seed tracks matching BandLab Screenshot
      s.setProjectName("Mouse Trap - Bright - Oct 11, 2026, 2:27 AM");
      s.setTempo(126);

      const t1 = s.addTrack("instrument", "piano"); // 01 Melody
      const t2 = s.addTrack("audio"); // 02 Voice/Audio
      const t3 = s.addTrack("instrument", "pluck"); // 03 Chords
      const t4 = s.addTrack("instrument", "bass"); // 04 Bass
      const t5 = s.addTrack("instrument", "drums"); // 05 Drums
      const t6 = s.addTrack("audio"); // 06 Voice/Audio

      s.updateTrack(t1, { name: "01 Melody", color: "#c68a18" }, false);
      s.updateTrack(t2, { name: "02 Voice/Audio", color: "#7c3aed" }, false);
      s.updateTrack(t3, { name: "03 Chords", color: "#c2410c" }, false);
      s.updateTrack(t4, { name: "04 Bass", color: "#059669" }, false);
      s.updateTrack(t5, { name: "05 Drums", color: "#0891b2" }, false);
      s.updateTrack(t6, { name: "06 Voice/Audio", color: "#7c3aed" }, false);

      // Seed clips
      const spb = 60 / 126;
      const leadLoop = LOOP_LIBRARY.find((l) => l.id === "synth-lead") ?? LOOP_LIBRARY[0];
      const chordsLoop = LOOP_LIBRARY.find((l) => l.id === "key-chords") ?? LOOP_LIBRARY[1];
      const bassLoop = LOOP_LIBRARY.find((l) => l.id === "bass-funky") ?? LOOP_LIBRARY[2];
      const drumLoop = LOOP_LIBRARY.find((l) => l.id === "drm-trap") ?? LOOP_LIBRARY[0];

      // Add looped clips across bars 1 to 16
      for (let bar = 0; bar < 4; bar++) {
        const atSec = bar * 4 * spb;
        s.addLoopClip(leadLoop, t1, atSec);
        s.addLoopClip(chordsLoop, t3, atSec);
        s.addLoopClip(bassLoop, t4, atSec);
        s.addLoopClip(drumLoop, t5, atSec);
      }

      s.setLoop(true, 0, 16);
      useStore.setState({ selectedTrackId: t1, bottomPanel: "fx" });
    }

    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") {
        return;
      }
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
    <div className="bandlab-app">
      <TopBar />
      <div className="bandlab-main-viewport">
        {leftPanelOpen && <LoopLibrary />}
        <Timeline />
        {masteringOpen && <MasteringDrawer />}
      </div>

      {/* Dynamic bottom drawer panel */}
      {bottomPanel === "instrument" && <InstrumentPanel />}
      {bottomPanel === "fx" && (
        <ErrorBoundary>
          <EffectsPanel />
        </ErrorBoundary>
      )}
      {bottomPanel === "lsp" && (
        <ErrorBoundary>
          <LspPluginsSuite />
        </ErrorBoundary>
      )}
      {bottomPanel === "piano" && <PianoRoll />}
      {bottomPanel === "mastering" && <MasteringPanel />}
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

      {/* Footer bottom dock */}
      <BottomDock />
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
