import { engine } from "../audio/engine";
import { useStore, uid } from "./store";
import type { Clip } from "../types";

let recTrackId: string | null = null;
let recStartPos = 0;

/** Called once at app start to wire engine -> store for recordings. */
export function initTransport() {
  engine.onRecorded = (trackId, blob, buffer) => {
    const s = useStore.getState();
    if (!buffer || buffer.duration < 0.05) {
      s.showToast("Rekaman gagal atau terlalu pendek");
      return;
    }
    const bufferId = uid();
    engine.addBuffer(bufferId, buffer);
    void blob;
    s.addAudioClip(trackId, bufferId, buffer.duration, recStartPos, "Recording");
    s.showToast("Rekaman selesai");
  };
}

export function playToggle() {
  const s = useStore.getState();
  if (s.isPlaying) {
    engine.pause();
    s.setPlaying(false);
  } else {
    engine.bpm = s.tempo;
    engine.loopEnabled = s.loopEnabled;
    engine.loopStart = s.loopStartBeat;
    engine.loopEnd = s.loopEndBeat;
    engine.play();
    s.setPlaying(true);
  }
}

export function stopAll() {
  const s = useStore.getState();
  if (s.isRecording) {
    engine.stopRecording();
    s.setRecording(false);
  }
  engine.stop();
  s.setPlaying(false);
}

export async function toggleRecord() {
  const s = useStore.getState();
  if (s.isRecording) {
    engine.stopRecording();
    s.setRecording(false);
    if (!s.isPlaying) {
      engine.stop();
      s.setPlaying(false);
    }
    return;
  }
  const armed = s.tracks.find((t) => t.armed);
  if (!armed) {
    s.showToast("Pilih track audio lalu tekan ● untuk arm recording");
    return;
  }
  if (!s.isPlaying) {
    engine.bpm = s.tempo;
    engine.play();
    s.setPlaying(true);
  }
  recTrackId = armed.id;
  recStartPos = engine.pos;
  try {
    await engine.startRecording(armed.id);
    s.setRecording(true);
  } catch {
    s.showToast("Izin mikrofon ditolak");
  }
  void recTrackId;
}

export function currentProjectLengthSec(): number {
  const { clips } = useStore.getState();
  return clips.reduce((m: number, c: Clip) => Math.max(m, c.start + c.duration), 0);
}
