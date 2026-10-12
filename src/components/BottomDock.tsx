import { useState } from "react";
import { useStore } from "../state/store";

export function BottomDock() {
  const bottomPanel = useStore((s) => s.bottomPanel);
  const setBottomPanel = useStore((s) => s.setBottomPanel);
  const leftPanelOpen = useStore((s) => s.leftPanelOpen);
  const toggleLeftPanel = useStore((s) => s.toggleLeftPanel);
  const showToast = useStore((s) => s.showToast);

  const [shortcutsModal, setShortcutsModal] = useState(false);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [lyricsText, setLyricsText] = useState("");

  const handleTab = (panel: "instrument" | "fx" | "piano" | "lsp") => {
    if (bottomPanel === panel) {
      setBottomPanel("none");
    } else {
      setBottomPanel(panel);
    }
  };

  return (
    <>
      <div className="bandlab-bottom-dock">
        <div className="dock-left-tabs">
          <button
            className={`dock-tab-btn ${bottomPanel === "instrument" ? "active" : ""}`}
            onClick={() => handleTab("instrument")}
          >
            <span className="dock-icon">🎹</span>
            <span className="dock-label">Instrument</span>
          </button>

          <button
            className={`dock-tab-btn ${bottomPanel === "fx" ? "active" : ""}`}
            onClick={() => handleTab("fx")}
          >
            <span className="dock-icon">fx</span>
            <span className="dock-label">Effects</span>
          </button>

          <button
            className={`dock-tab-btn lsp-dock-btn ${bottomPanel === "lsp" ? "active" : ""}`}
            onClick={() => handleTab("lsp")}
            title="Linux Studio Plugins Suite (egidf/lsp-plugins)"
          >
            <span className="dock-icon">⚡</span>
            <span className="dock-label">LSP Plugins</span>
            <span className="lsp-mini-tag">v1.2</span>
          </button>

          <button
            className={`dock-tab-btn ${bottomPanel === "piano" ? "active" : ""}`}
            onClick={() => handleTab("piano")}
          >
            <span className="dock-icon">🎹</span>
            <span className="dock-label">MIDI Editor</span>
          </button>
        </div>

        <div className="dock-right-tools">
          <button
            className={`dock-tool-btn ${lyricsOpen ? "active" : ""}`}
            onClick={() => setLyricsOpen(!lyricsOpen)}
          >
            <span className="dock-icon">📝</span>
            <span className="dock-label">Lyrics/Notes</span>
          </button>

          <button
            className={`dock-tool-btn ${leftPanelOpen ? "active" : ""}`}
            onClick={toggleLeftPanel}
          >
            <span className="dock-icon">🎶</span>
            <span className="dock-label">BandLab Sounds</span>
          </button>

          <button
            className="dock-tool-btn"
            onClick={() => {
              const s = useStore.getState();
              s.addTrack("instrument", "drums");
              showToast("Drum machine track added");
            }}
          >
            <span className="dock-icon">🥁</span>
            <span className="dock-label">Beats</span>
          </button>

          <button
            className={`dock-tool-btn ${shortcutsModal ? "active" : ""}`}
            onClick={() => setShortcutsModal(!shortcutsModal)}
          >
            <span className="dock-icon">⌨️</span>
            <span className="dock-label">Shortcuts</span>
          </button>
        </div>
      </div>

      {/* Lyrics / Notes Modal Drawer */}
      {lyricsOpen && (
        <div className="dock-popup-drawer">
          <div className="popup-head">
            <span className="popup-title">Song Lyrics & Notes</span>
            <button className="icon-btn-ghost" onClick={() => setLyricsOpen(false)}>
              ✕
            </button>
          </div>
          <textarea
            className="popup-textarea"
            placeholder="Type lyrics, chord progressions, or project notes here..."
            value={lyricsText}
            onChange={(e) => setLyricsText(e.target.value)}
          />
        </div>
      )}

      {/* Keyboard Shortcuts Dialog */}
      {shortcutsModal && (
        <div className="dock-popup-dialog" onClick={() => setShortcutsModal(false)}>
          <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-head">
              <h3>BandLab Shortcuts</h3>
              <button className="icon-btn-ghost" onClick={() => setShortcutsModal(false)}>
                ✕
              </button>
            </div>
            <div className="shortcuts-grid">
              <div className="sc-item">
                <kbd>Space</kbd>
                <span>Play / Pause</span>
              </div>
              <div className="sc-item">
                <kbd>Shift + Space</kbd>
                <span>Stop & Return to Start</span>
              </div>
              <div className="sc-item">
                <kbd>R</kbd>
                <span>Record Toggle</span>
              </div>
              <div className="sc-item">
                <kbd>Delete / Backspace</kbd>
                <span>Delete Selected Clip</span>
              </div>
              <div className="sc-item">
                <kbd>Ctrl / ⌘ + Z</kbd>
                <span>Undo</span>
              </div>
              <div className="sc-item">
                <kbd>Ctrl / ⌘ + Y</kbd>
                <span>Redo</span>
              </div>
              <div className="sc-item">
                <kbd>M</kbd>
                <span>Mute Selected Track</span>
              </div>
              <div className="sc-item">
                <kbd>S</kbd>
                <span>Solo Selected Track</span>
              </div>
              <div className="sc-item">
                <kbd>A - K / W - P</kbd>
                <span>Play Virtual Keyboard</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
