"use client";

import { useEffect } from "react";

const STEPS = [
  {
    title: "Simulate",
    body: "1,000 storms over 30 real Mumbai sites. Each flood spot or hillside fails when rain passes its threshold (with uncertainty). Failures then spread along 30 dependency links (flood → substation → pumps → drinking water → hospitals), each with a probability and a delay.",
  },
  {
    title: "Predict",
    body: "For every site: the chance it fails, the hour it usually fails, and how much harm it triggers downstream. The most damaging cascade chains are ranked, so you can see which failure starts the dominoes.",
  },
  {
    title: "Plan",
    body: "The optimiser sends each response team, generator and purification unit wherever it cuts the most harm, re-running the whole cascade for every option (about 400 simulations in roughly 60 ms). It's compared against no action and a hazard-first plan given the same resources.",
  },
  {
    title: "Brief",
    body: "An LLM turns the results into a 30-second briefing for the incident commander. It may only use numbers from the simulation, and a rule-based briefing takes over if the AI is unavailable.",
  },
];

const TRY = [
  "Press ▶ under the map to watch the storm unfold hour by hour.",
  "Switch between Hazard-first and Domino to see where resources go and what changes.",
  "Drag rainfall down to 150 mm: cascades matter even more in smaller storms.",
  "Click any site for its dependencies, or open Cascades for the chains that do the most harm.",
];

export default function About({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[2000] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        className="scroll-thin max-h-[90vh] w-full max-w-2xl overflow-y-auto relative rounded-2xl border border-line-2 bg-panel p-5 shadow-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-md px-2 py-1 text-ink-3 hover:text-ink"
          aria-label="Close"
        >
          ✕
        </button>
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-accent">How Domino works</div>
        <h2 id="about-title" className="mb-2 text-xl font-semibold tracking-tight">
          One storm is never one disaster.
        </h2>
        <p className="mb-4 text-sm leading-relaxed text-ink-2">
          Floods knock out substations, substations stop water pumps, and a day later the tap water is contaminated. Domino
          predicts these chains before they happen and decides where limited rescue teams and supplies will break them.
        </p>
        <ol className="mb-4 grid gap-2.5 sm:grid-cols-2">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-xl border border-line bg-panel-2 p-3">
              <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
                <span className="num grid h-5 w-5 place-items-center rounded-full bg-accent text-[11px] text-[#1a0d06]">{i + 1}</span>
                {s.title}
              </div>
              <p className="text-[12.5px] leading-snug text-ink-2">{s.body}</p>
            </li>
          ))}
        </ol>
        <div className="mb-4">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-3">Try this</div>
          <ul className="space-y-1 text-[13px] text-ink-2">
            {TRY.map((t) => (
              <li key={t} className="flex gap-2">
                <span className="text-accent">→</span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="mb-4 rounded-lg border border-warning/30 bg-warning/5 p-3 text-[12px] leading-relaxed text-ink-3">
          Locations are real. Populations, thresholds and dependency probabilities are illustrative values for this
          prototype, not official risk data. With municipal drainage, IMD forecast and utility network data, the same model and
          optimiser would run unchanged.
        </p>
        <button
          onClick={onClose}
          className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-[#1a0d06] transition hover:brightness-110"
        >
          Open the dashboard
        </button>
      </div>
    </div>
  );
}
