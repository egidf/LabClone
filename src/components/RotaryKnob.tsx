import React, { useRef, useState, useEffect } from "react";

interface RotaryKnobProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: number;
  label?: string;
  unit?: string;
  size?: number; // diameter in px (default 46px)
  color?: string; // active ring color
  trackColor?: string;
  bipolar?: boolean; // if true, zero is at 12 o'clock (e.g. Pan, EQ boost/cut)
  showValue?: boolean;
  valueFormat?: (v: number) => string;
  onChange: (value: number) => void;
  className?: string;
}

export function RotaryKnob({
  value,
  min = 0,
  max = 100,
  step = 1,
  defaultValue,
  label,
  unit = "",
  size = 46,
  color = "#f2543d",
  trackColor = "rgba(255, 255, 255, 0.12)",
  bipolar = false,
  showValue = true,
  valueFormat,
  onChange,
  className = "",
}: RotaryKnobProps) {
  const isDragging = useRef(false);
  const startPos = useRef<{ x: number; y: number; val: number }>({ x: 0, y: 0, val: 0 });
  const [hovered, setHovered] = useState(false);
  const [active, setActive] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editInput, setEditInput] = useState("");

  const range = max - min;
  const clampedValue = Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
  const norm = range === 0 ? 0 : (clampedValue - min) / range;
  const currentAngle = -135 + norm * 270;

  // Window-level mouse/pointer listeners to guarantee zero dropouts during drag
  const onPointerDown = (e: React.PointerEvent) => {
    if (editing) return;
    e.preventDefault();
    e.stopPropagation();
    isDragging.current = true;
    startPos.current = { x: e.clientX, y: e.clientY, val: clampedValue };
    setActive(true);

    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const dy = startPos.current.y - e.clientY;
    const dx = e.clientX - startPos.current.x;
    // Dominant drag movement: vertical or horizontal
    const dragDelta = Math.abs(dy) >= Math.abs(dx) ? dy : dx;

    // Shift key enables precision adjustment (4x finer)
    const sensitivity = e.shiftKey ? 450 : 130;
    const delta = (dragDelta / sensitivity) * range;
    let nextVal = startPos.current.val + delta;

    if (step && step > 0) {
      nextVal = Math.round(nextVal / step) * step;
    }
    nextVal = Math.min(max, Math.max(min, nextVal));
    const rounded = Number(nextVal.toFixed(step < 0.1 ? 2 : step < 1 ? 1 : 0));
    onChange(rounded);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (isDragging.current) {
      isDragging.current = false;
      setActive(false);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
  };

  // Mouse wheel scroll to adjust smoothly
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const dir = e.deltaY < 0 ? 1 : -1;
    const wheelStep = step || range / 50 || 1;
    const mult = e.shiftKey ? 0.25 : 1;
    let nextVal = clampedValue + dir * wheelStep * mult;
    if (step && step > 0) {
      nextVal = Math.round(nextVal / step) * step;
    }
    nextVal = Math.min(max, Math.max(min, nextVal));
    onChange(Number(nextVal.toFixed(step < 0.1 ? 2 : step < 1 ? 1 : 0)));
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const target =
      defaultValue !== undefined ? defaultValue : bipolar ? (min + max) / 2 : min;
    onChange(target);
  };

  const handleEditSubmit = () => {
    setEditing(false);
    const parsed = parseFloat(editInput);
    if (!Number.isNaN(parsed)) {
      const next = Math.min(max, Math.max(min, parsed));
      onChange(Number(next.toFixed(2)));
    }
  };

  // SVG Arc calculation for active progress ring
  const strokeWidth = Math.max(3.5, Math.round(size * 0.085));
  const radius = (size - strokeWidth * 2) / 2;
  const center = size / 2;
  const circ = 2 * Math.PI * radius;
  const maxDash = circ * 0.75; // 270 degrees arc

  let strokeDashoffset = 0;
  let strokeDasharray = `${maxDash} ${circ}`;
  let rotationOffset = 135; // 7:30 position

  if (bipolar) {
    const mid = (min + max) / 2;
    const halfDash = maxDash / 2;
    const midNorm = (clampedValue - mid) / (range / 2); // -1 to 1
    const fillLength = Math.abs(midNorm) * halfDash;
    strokeDasharray = `${fillLength} ${circ}`;

    if (midNorm >= 0) {
      rotationOffset = -90; // clockwise from 12 o'clock
      strokeDashoffset = 0;
    } else {
      rotationOffset = -90 - (fillLength / circ) * 360;
      strokeDashoffset = 0;
    }
  } else {
    const fillLength = norm * maxDash;
    strokeDasharray = `${fillLength} ${circ}`;
    rotationOffset = 135;
    strokeDashoffset = 0;
  }

  const formatText = () => {
    if (valueFormat) return valueFormat(clampedValue);
    if (bipolar) {
      if (Math.abs(clampedValue) < 0.01) return "C";
      return clampedValue > 0
        ? `+${clampedValue}${unit}`
        : `${clampedValue}${unit}`;
    }
    return `${Number.isInteger(clampedValue) ? clampedValue : clampedValue.toFixed(1)}${unit}`;
  };

  return (
    <div
      className={`rotary-knob-wrapper ${className} ${active ? "active" : ""} ${hovered ? "hovered" : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onWheel={onWheel}
      title={`${label ?? "Knob"}: ${formatText()} (Drag up/down, scroll wheel, double-click to reset)`}
    >
      <div
        className="rotary-dial-container"
        style={{ width: size, height: size }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="rotary-dial-svg"
        >
          {/* Background Track Arc */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={trackColor}
            strokeWidth={strokeWidth}
            strokeDasharray={`${maxDash} ${circ}`}
            strokeDashoffset={0}
            strokeLinecap="round"
            transform={`rotate(135 ${center} ${center})`}
          />

          {/* Active Colored Arc */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={strokeDasharray}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            transform={`rotate(${rotationOffset} ${center} ${center})`}
            style={{
              filter: active ? `drop-shadow(0 0 5px ${color})` : "none",
              transition: isDragging.current ? "none" : "stroke-dasharray 0.08s ease",
            }}
          />
        </svg>

        {/* Inner Metallic Cap */}
        <div
          className="rotary-dial-cap"
          style={{
            inset: strokeWidth + 2,
            boxShadow: active
              ? `0 0 12px ${color}60, inset 0 2px 4px rgba(255,255,255,0.2)`
              : hovered
              ? `0 2px 8px rgba(0,0,0,0.5), inset 0 1px 2px rgba(255,255,255,0.15)`
              : undefined,
          }}
        >
          {/* Rotating Needle / Dot Indicator */}
          <div
            className="rotary-needle-pivot"
            style={{
              transform: `rotate(${currentAngle}deg)`,
              transition: isDragging.current ? "none" : "transform 0.08s ease",
            }}
          >
            <div
              className="rotary-indicator-dot"
              style={{
                background: active ? "#ffffff" : color,
                boxShadow: active ? `0 0 8px #ffffff` : "none",
              }}
            />
          </div>
        </div>
      </div>

      {/* Label */}
      {label && <span className="rotary-label">{label}</span>}

      {/* Value Readout */}
      {showValue && (
        <div className="rotary-value-wrap">
          {editing ? (
            <input
              type="number"
              autoFocus
              className="rotary-value-input"
              value={editInput}
              onChange={(e) => setEditInput(e.target.value)}
              onBlur={handleEditSubmit}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleEditSubmit();
                if (e.key === "Escape") setEditing(false);
              }}
            />
          ) : (
            <span
              className="rotary-value-readout"
              onClick={() => {
                setEditInput(String(clampedValue));
                setEditing(true);
              }}
              title="Click to type exact value"
            >
              {formatText()}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
