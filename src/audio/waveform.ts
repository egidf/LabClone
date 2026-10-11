const peakCache = new Map<string, Float32Array>();

/** Min/max peak pairs for drawing a waveform, cached per buffer+width. */
export function getPeaks(buffer: AudioBuffer, width: number): Float32Array {
  const key = `${buffer.duration.toFixed(3)}_${buffer.length}_${width}`;
  const hit = peakCache.get(key);
  if (hit) return hit;
  const data = buffer.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / width));
  const peaks = new Float32Array(width * 2);
  for (let i = 0; i < width; i++) {
    const start = i * step;
    let min = 1;
    let max = -1;
    for (let j = 0; j < step; j += Math.max(1, Math.floor(step / 32))) {
      const v = data[start + j] ?? 0;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    peaks[i * 2] = min;
    peaks[i * 2 + 1] = max;
  }
  peakCache.set(key, peaks);
  return peaks;
}

export function drawWaveform(
  canvas: HTMLCanvasElement,
  buffer: AudioBuffer,
  color: string,
  offset = 0,
  duration = buffer.duration,
) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w === 0 || h === 0) return;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const sr = buffer.sampleRate;
  const startSample = Math.floor(offset * sr);
  const endSample = Math.min(buffer.length, Math.floor((offset + duration) * sr));
  const visible = Math.max(1, endSample - startSample);
  const data = buffer.getChannelData(0);
  const step = visible / w;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.9;
  for (let x = 0; x < w; x++) {
    const s0 = startSample + Math.floor(x * step);
    const s1 = startSample + Math.floor((x + 1) * step);
    let min = 1;
    let max = -1;
    const stride = Math.max(1, Math.floor((s1 - s0) / 24));
    for (let i = s0; i < s1; i += stride) {
      const v = data[i] ?? 0;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const yMid = h / 2;
    const y1 = yMid - max * (h / 2 - 2);
    const y2 = yMid - min * (h / 2 - 2);
    ctx.fillRect(x, y1, 1, Math.max(1, y2 - y1));
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();
}
