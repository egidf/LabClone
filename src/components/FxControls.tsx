import { useCallback, useRef, useState } from "react";

/* ------------------------------------------------------------------ knob */

export function Knob({
  value,
  min = 0,
  max = 100,
  label,
  onChange,
  size = 40,
  color = "var(--accent)",
  unit = "",
  bipolar = false,
}: {
  value: number;
  min?: number;
  max?: number;
  label: string;
  onChange: (v: number) => void;
  size?: number;
  color?: string;
  unit?: string;
  bipolar?: boolean;
}) {
  const drag = useRef<{ startY: number; startVal: number } | null>(null);
  const range = max - min;
  const pct = (value - min) / range;

  const angle = -135 + pct * 270;

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    drag.current = { startY: e.clientY, startVal: value };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dy = drag.current.startY - e.clientY;
    const delta = (dy / 150) * range;
    const next = Math.max(min, Math.min(max, drag.current.startVal + delta));
    onChange(Math.round(next * 100) / 100);
  };

  const onPointerUp = () => (drag.current = null);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1,
        userSelect: "none",
        flex: "0 0 auto",
      }}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: `conic-gradient(from ${angle - 90}deg, ${color} ${pct * 360 * 0.75}deg, #1a1b21 ${pct * 360 * 0.75}deg)`,
          position: "relative",
          cursor: "ns-resize",
          boxShadow: "0 2px 6px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.08)",
        }}
      >
        {/* inner cap */}
        <div
          style={{
            position: "absolute",
            inset: 3,
            borderRadius: "50%",
            background: "linear-gradient(145deg, #2a2b33, #17181d)",
            border: "1px solid #111216",
          }}
        />
        {/* indicator */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            transform: `rotate(${angle}deg)`,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 2,
              left: "50%",
              width: 2,
              height: size / 4,
              background: "#e8eaf0",
              borderRadius: 1,
              transform: "translateX(-50%)",
            }}
          />
        </div>
      </div>
      <span style={{ fontSize: 9, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.3 }}>
        {label}
      </span>
      <span style={{ fontSize: 8, color: "var(--muted-2)", fontVariantNumeric: "tabular-nums" }}>
        {typeof value === "number" ? (Number.isInteger(value) ? value : value.toFixed(1)) : value}
        {unit}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ fader */

export function MiniFader({
  value,
  min = 0,
  max = 100,
  label,
  onChange,
  height = 80,
  color = "var(--text)",
}: {
  value: number;
  min?: number;
  max?: number;
  label?: string;
  onChange: (v: number) => void;
  height?: number;
  color?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
      <div style={{ position: "relative", width: 16, height }}>
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            bottom: 0,
            width: 3,
            transform: "translateX(-50%)",
            background: "#1a1b21",
            borderRadius: 2,
          }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={0.5}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{
            position: "absolute",
            inset: 0,
            width: height,
            transform: `rotate(-90deg) translateX(-${height / 2}px)`,
            transformOrigin: "center",
            marginLeft: `${8 - height / 2}px`,
            background: "transparent",
            WebkitAppearance: "none",
            appearance: "none",
            cursor: "pointer",
          }}
        />
      </div>
      {label && (
        <span style={{ fontSize: 8, fontWeight: 700, color: "var(--muted)" }}>{label}</span>
      )}
    </div>
  );
}

/* ------------------------------------------------------- plugin wrapper */

export function PluginCard({
  name,
  icon,
  active,
  onToggle,
  onClose,
  children,
}: {
  name: string;
  icon?: string;
  active: boolean;
  onToggle: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="plugin-card"
      style={{
        opacity: active ? 1 : 0.55,
        borderColor: active ? "var(--border-light)" : "var(--border)",
      }}
    >
      <div className="plugin-head">
        <button
          className={`plugin-power ${active ? "on" : ""}`}
          onClick={onToggle}
          title="Power"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M12 2v10M18.4 6.6a9 9 0 1 1-12.8 0" strokeLinecap="round" />
          </svg>
        </button>
        {icon && <span className="plugin-icon">{icon}</span>}
        <span className="plugin-name">{name}</span>
        <button className="plugin-info" title="Info">i</button>
        <button className="plugin-close" onClick={onClose} title="Remove">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="plugin-body">{children}</div>
    </div>
  );
}

/* --------------------------------------------------------- fx parameter */

export interface FxParam {
  knob?: { label: string; value: number; min?: number; max?: number; unit?: string; bipolar?: boolean };
  fader?: { label: string; value: number; min?: number; max?: number; unit?: string };
  dropdown?: { label: string; value: string; options: string[] };
  toggle?: { label: string; value: boolean };
}

export function FxParamRow({
  param,
  onChange,
}: {
  param: FxParam;
  onChange: (key: string, value: number | string | boolean) => void;
}) {
  const key =
    param.knob?.label ?? param.fader?.label ?? param.dropdown?.label ?? param.toggle?.label ?? "";

  if (param.knob) {
    const k = param.knob;
    return (
      <div className="fx-knob-cell">
        <Knob
          value={k.value}
          min={k.min}
          max={k.max}
          label={k.label}
          unit={k.unit}
          bipolar={k.bipolar}
          onChange={(v) => onChange(key, v)}
        />
      </div>
    );
  }
  if (param.fader) {
    const f = param.fader;
    return (
      <div className="fx-fader-cell">
        <MiniFader
          value={f.value}
          min={f.min}
          max={f.max}
          label={f.label}
          onChange={(v) => onChange(key, v)}
        />
      </div>
    );
  }
  if (param.dropdown) {
    const d = param.dropdown;
    return (
      <div className="fx-dropdown-cell">
        <span className="fx-dropdown-label">{d.label}</span>
        <select
          className="fx-dropdown"
          value={d.value}
          onChange={(e) => onChange(key, e.target.value)}
        >
          {d.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
    );
  }
  if (param.toggle) {
    const t = param.toggle;
    return (
      <div className="fx-toggle-cell">
        <span className="fx-toggle-label">{t.label}</span>
        <button
          className={`fx-toggle ${t.value ? "on" : ""}`}
          onClick={() => onChange(key, !t.value)}
        >
          {t.value ? "ON" : "OFF"}
        </button>
      </div>
    );
  }
  return null;
}
