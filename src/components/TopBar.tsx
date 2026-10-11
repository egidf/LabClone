import { useRef } from "react";
import { useStore } from "../state/store";
import { engine } from "../audio/engine";
import { encodeWav } from "../audio/wav";
import { currentProjectLengthSec } from "../state/transport";
import type { Clip, Track } from "../types";

interface ProjectFile {
  format: "labclone-project";
  version: 1;
  name: string;
  tempo: number;
  tracks: Track[];
  clips: Clip[];
}

export function TopBar() {
  const name = useStore((s) => s.name);
  const setProjectName = useStore((s) => s.setProjectName);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const showToast = useStore((s) => s.showToast);
  const fileRef = useRef<HTMLInputElement>(null);

  const exportWav = async () => {
    const s = useStore.getState();
    const total = currentProjectLengthSec();
    if (total < 0.1) {
      showToast("Project masih kosong — tambahkan clip dulu");
      return;
    }
    showToast("Rendering mixdown…");
    try {
      const buf = await engine.renderProject(s.tracks, s.clips, s.tempo, total);
      const blob = encodeWav(buf);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${(s.name || "project").replace(/[^\w\- ]+/g, "")}.wav`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      showToast("Export WAV berhasil");
    } catch {
      showToast("Export gagal");
    }
  };

  const saveProject = () => {
    const s = useStore.getState();
    const data: ProjectFile = {
      format: "labclone-project",
      version: 1,
      name: s.name,
      tempo: s.tempo,
      tracks: s.tracks,
      clips: s.clips,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(s.name || "project").replace(/[^\w\- ]+/g, "")}.lcproj.json`;
    a.click();
    showToast("Project tersimpan (clip audio perlu di-rekam ulang)");
  };

  const openProject = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as ProjectFile;
      if (data.format !== "labclone-project") throw new Error("bad format");
      const clips = data.clips.filter((c) => c.kind !== "audio" || engine.buffers.has(c.bufferId ?? ""));
      useStore.setState({
        name: data.name,
        tempo: data.tempo,
        tracks: data.tracks,
        clips,
        past: [],
        future: [],
        selectedClipId: null,
        selectedTrackId: null,
      });
      engine.bpm = data.tempo;
      engine.syncTracks(data.tracks);
      showToast("Project dimuat");
    } catch {
      showToast("File project tidak valid");
    }
  };

  return (
    <div className="topbar">
      <div className="logo">
        <div className="mark">L</div>
        <span>LabClone</span>
      </div>
      <div className="topbar-center">
        <input
          className="project-name"
          value={name}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder="Untitled Project"
        />
        <span className="save-status">Last Saved: Never</span>
      </div>
      <div className="topbar-right">
        <button className="icon-btn" title="Undo (Ctrl+Z)" onClick={undo} style={{ opacity: canUndo ? 1 : 0.35 }}>
          ↶
        </button>
        <button className="icon-btn" title="Redo (Ctrl+Shift+Z)" onClick={redo} style={{ opacity: canRedo ? 1 : 0.35 }}>
          ↷
        </button>
        <button className="btn ghost" onClick={() => fileRef.current?.click()}>
          Open
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void openProject(f);
            e.target.value = "";
          }}
        />
        <button className="btn ghost" onClick={saveProject}>
          Save
        </button>
        <button className="btn primary" onClick={() => void exportWav()}>
          Export WAV
        </button>
      </div>
    </div>
  );
}
