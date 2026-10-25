"use client";

import { useState } from "react";
import { HORIZON, RAIN_HOURS } from "@/lib/sim/engine";

interface Props {
  rain: number[];
  hour: number;
  playing: boolean;
  failuresByHour: number[];
  onHour: (h: number) => void;
  onPlay: () => void;
}

const W = 720;
const H = 64;
const r2 = (x: number) => Math.round(x * 100) / 100; // same SVG numbers on server and client

/** Hourly rainfall bars with a playhead; drag or play to watch the cascade unfold. */
export default function Timeline({ rain, hour, playing, failuresByHour, onHour, onPlay }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...rain, 1);
  const step = W / (HORIZON + 1);
  const bar = step - 2; // 2px surface gap between bars
  const shown = hover ?? Math.round(hour);

  return (
    <div className="flex items-center gap-3 border-t border-line bg-panel px-3 py-2">
      <button
        onClick={onPlay}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-[#1a0d06] transition hover:brightness-110"
        aria-label={playing ? "Pause storm playback" : "Play storm"}
      >
        {playing ? (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="ml-0.5 h-4 w-4" fill="currentColor">
            <path d="M7 5v14l12-7z" />
          </svg>
        )}
      </button>

      <div className="relative min-w-0 flex-1">
        <div className="mb-1 flex items-baseline justify-between text-[11px] text-ink-3">
          <span>
            Hour <span className="num font-semibold text-ink">{shown}</span>
            {shown < RAIN_HOURS ? (
              <>
                {" "}· rain <span className="num text-ink-2">{rain[shown]?.toFixed(0)} mm/h</span>
              </>
            ) : (
              " · rain stopped, cascades continue"
            )}
          </span>
          <span>
            Expected failures so far{" "}
            <span className="num font-semibold text-ink">{failuresByHour[Math.round(shown)]?.toFixed(1)}</span>
          </span>
        </div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="block h-12 w-full cursor-pointer touch-none"
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const h = Math.max(0, Math.min(HORIZON, Math.floor(((e.clientX - r.left) / r.width) * (HORIZON + 1))));
            setHover(h);
            if (e.buttons === 1) onHour(h);
          }}
          onPointerLeave={() => setHover(null)}
          onPointerDown={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            onHour(Math.max(0, Math.min(HORIZON, Math.floor(((e.clientX - r.left) / r.width) * (HORIZON + 1)))));
          }}
          role="slider"
          aria-label="Storm hour"
          aria-valuemin={0}
          aria-valuemax={HORIZON}
          aria-valuenow={Math.round(hour)}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") onHour(Math.min(HORIZON, Math.round(hour) + 1));
            if (e.key === "ArrowLeft") onHour(Math.max(0, Math.round(hour) - 1));
          }}
        >
          <line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} stroke="var(--line-2)" />
          {Array.from({ length: HORIZON + 1 }, (_, h) => {
            const v = h < RAIN_HOURS ? rain[h] : 0;
            const bh = Math.max(v > 0 ? 2 : 0, (v / max) * (H - 8));
            const past = h <= hour;
            return (
              <rect
                key={h}
                x={r2(h * step + 1)}
                y={r2(H - 1 - bh)}
                width={r2(bar)}
                height={r2(bh)}
                rx={Math.min(3, bar / 2)}
                fill="var(--rain)"
                opacity={hover === h ? 1 : past ? 0.9 : 0.35}
              />
            );
          })}
          <line
            x1={r2((hour + 0.5) * step)}
            x2={r2((hour + 0.5) * step)}
            y1="0"
            y2={H}
            stroke="var(--accent)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div className="mt-0.5 flex justify-between text-[10px] text-ink-3 num">
          <span>0h</span>
          <span>12h</span>
          <span>24h · rain ends</span>
          <span>36h</span>
        </div>
      </div>
    </div>
  );
}
