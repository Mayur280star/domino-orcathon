"use client";

import { useState } from "react";
import { ruleBrief, type BriefFacts } from "@/lib/sim/brief";

function inline(text: string) {
  // **bold** only; everything else is plain text.
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold text-ink">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function Markdown({ text }: { text: string }) {
  return (
    <div className="space-y-1.5 text-[13px] leading-relaxed text-ink-2">
      {text.split("\n").map((raw, i) => {
        const line = raw.trim();
        if (!line) return null;
        if (line.startsWith("#")) {
          return (
            <h4 key={i} className="pt-2 text-[11px] font-semibold uppercase tracking-wider text-accent first:pt-0">
              {line.replace(/^#+\s*/, "")}
            </h4>
          );
        }
        const num = line.match(/^(\d+)\.\s+(.*)$/);
        if (num) {
          return (
            <div key={i} className="flex gap-2">
              <span className="num w-4 shrink-0 text-ink-3">{num[1]}.</span>
              <span>{inline(num[2])}</span>
            </div>
          );
        }
        if (/^[-*]\s+/.test(line)) {
          return (
            <div key={i} className="flex gap-2">
              <span className="w-4 shrink-0 text-ink-3">•</span>
              <span>{inline(line.replace(/^[-*]\s+/, ""))}</span>
            </div>
          );
        }
        return <p key={i}>{inline(line)}</p>;
      })}
    </div>
  );
}

export default function Brief({ facts }: { facts: BriefFacts }) {
  const [state, setState] = useState<{ text: string; source: string; model: string | null; key: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const key = JSON.stringify(facts);
  const stale = state && state.key !== key;

  async function generate() {
    setLoading(true);
    try {
      const r = await fetch("/api/brief", { method: "POST", headers: { "Content-Type": "application/json" }, body: key });
      if (!r.ok) throw new Error(`brief: ${r.status}`);
      const data = await r.json();
      setState({ ...data, key });
    } catch {
      // Offline or no server: the rule-based briefing needs nothing but the facts.
      setState({ text: ruleBrief(facts), source: "rules", model: null, key });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <p className="mb-3 text-[13px] text-ink-3">
        Turns the simulation into a 30-second briefing for the incident commander. Every number in it comes from the model
        output, not from the language model.
      </p>
      <button
        onClick={generate}
        disabled={loading}
        className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-sm font-semibold text-[#1a0d06] transition hover:brightness-110 disabled:opacity-60"
      >
        {loading ? (
          <>
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#1a0d06] border-t-transparent" />
            Writing briefing…
          </>
        ) : state ? (
          "Regenerate briefing"
        ) : (
          "Generate commander's briefing"
        )}
      </button>
      {state && (
        <div className={`rounded-lg border border-line bg-panel-2 p-3 ${stale ? "opacity-50" : ""}`}>
          <div className="mb-2 flex items-center justify-between text-[11px] text-ink-3">
            <span>
              {state.source === "ai" ? `AI briefing · ${state.model}` : "Rule-based briefing (AI unavailable)"}
            </span>
            {stale && <span className="text-warning">Scenario changed — regenerate</span>}
          </div>
          <Markdown text={state.text} />
        </div>
      )}
    </div>
  );
}
