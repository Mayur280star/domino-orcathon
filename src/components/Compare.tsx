"use client";

import { useState } from "react";
import type { SimResult } from "@/lib/sim/types";
import { fmt } from "@/lib/ui";

export type Strategy = "none" | "naive" | "domino";

export const STRATEGY_LABEL: Record<Strategy, string> = {
  none: "No action",
  naive: "Hazard-first plan",
  domino: "Domino plan",
};

interface Props {
  results: Record<Strategy, SimResult>;
  active: Strategy;
  onPick: (s: Strategy) => void;
}

/**
 * Expected harm under each plan, split into harm from the rain itself and harm
 * from secondary disasters. One unit (people at serious risk), one axis.
 */
export default function Compare({ results, active, onPick }: Props) {
  const [tip, setTip] = useState<{ s: Strategy; part: "direct" | "cascade" } | null>(null);
  const max = results.none.totalHarm || 1;
  const order: Strategy[] = ["none", "naive", "domino"];

  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-[11px] text-ink-2">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-direct" /> Direct (rain)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-cascade" /> Secondary disasters
        </span>
      </div>
      <div className="space-y-2.5">
        {order.map((s) => {
          const r = results[s];
          const direct = r.totalHarm - r.cascadeHarm;
          const saved = 1 - r.totalHarm / max;
          return (
            <button
              key={s}
              onClick={() => onPick(s)}
              className={`block w-full rounded-lg border px-2.5 py-2 text-left transition ${
                active === s ? "border-ink-2 bg-panel-2" : "border-line hover:border-line-2"
              }`}
            >
              <div className="mb-1.5 flex items-baseline justify-between text-xs">
                <span className={active === s ? "font-semibold text-ink" : "text-ink-2"}>{STRATEGY_LABEL[s]}</span>
                <span className="num text-ink-2">
                  <span className="font-semibold text-ink">{fmt(r.totalHarm)}</span>
                  {s !== "none" && <span className="ml-1.5 text-ink-3">−{Math.round(saved * 100)}%</span>}
                </span>
              </div>
              <div className="relative flex h-3.5 w-full gap-[2px]">
                <div
                  className="h-full rounded-l-[4px] bg-direct"
                  style={{ width: `${(direct / max) * 100}%` }}
                  onMouseEnter={() => setTip({ s, part: "direct" })}
                  onMouseLeave={() => setTip(null)}
                />
                <div
                  className="h-full rounded-r-[4px] bg-cascade"
                  style={{ width: `${(r.cascadeHarm / max) * 100}%` }}
                  onMouseEnter={() => setTip({ s, part: "cascade" })}
                  onMouseLeave={() => setTip(null)}
                />
                {tip?.s === s && (
                  <div className="pointer-events-none absolute -top-9 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-line-2 bg-panel-2 px-2 py-1 text-[11px] text-ink shadow-lg">
                    {tip.part === "direct" ? "Direct harm" : "Secondary-disaster harm"}:{" "}
                    <b className="num">{fmt(tip.part === "direct" ? direct : r.cascadeHarm)}</b>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
