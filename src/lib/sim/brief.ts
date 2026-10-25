import type { Plan } from "./engine";
import type { Allocation, City, Scenario, SimResult } from "./types";
import { KIND_LABEL, RESOURCE, actionFor, fmt, pct } from "../ui";

/** Compact, number-checked facts the briefing is written from. */
export interface BriefFacts {
  city: string;
  rainfallMm: number;
  highTide: boolean;
  expectedFailures: number;
  firstFailure: { name: string; hazard: string; hour: number } | null;
  harm: { noAction: number; hazardFirst: number; domino: number };
  cascadeHarm: { noAction: number; hazardFirst: number; domino: number };
  topChains: { path: string[]; probability: string; harm: number }[];
  mostVulnerable: { name: string; hazard: string; pFail: string; hour: number; downstreamHarm: number }[];
  dominoPlan: { resource: string; site: string; action: string; harmPrevented: number }[];
  hazardFirstPlan: { resource: string; site: string }[];
  timeline: { hour: number; event: string; probability: string }[];
}

export function buildFacts(
  city: City,
  scenario: Scenario,
  none: SimResult,
  naive: SimResult,
  domino: SimResult,
  naiveAlloc: Allocation,
  plan: Plan,
): BriefFacts {
  const byId = new Map(city.nodes.map((n) => [n.id, n]));
  const name = (id: string) => byId.get(id)!.name;

  const likely = city.nodes
    .map((n) => ({ n, s: none.nodes[n.id] }))
    .filter((x) => x.s.pFail >= 0.5)
    .sort((a, b) => a.s.meanHour - b.s.meanHour);

  return {
    city: city.name,
    rainfallMm: scenario.rainfall,
    highTide: scenario.highTide,
    expectedFailures: Number(none.expectedFailures.toFixed(1)),
    firstFailure: likely[0]
      ? { name: likely[0].n.name, hazard: KIND_LABEL[likely[0].n.kind], hour: Math.round(likely[0].s.meanHour) }
      : null,
    harm: {
      noAction: Math.round(none.totalHarm),
      hazardFirst: Math.round(naive.totalHarm),
      domino: Math.round(domino.totalHarm),
    },
    cascadeHarm: {
      noAction: Math.round(none.cascadeHarm),
      hazardFirst: Math.round(naive.cascadeHarm),
      domino: Math.round(domino.cascadeHarm),
    },
    topChains: none.chains.slice(0, 3).map((c) => ({
      path: c.path.map(name),
      probability: pct(c.prob),
      harm: Math.round(c.harm),
    })),
    mostVulnerable: city.nodes
      .map((n) => ({ n, s: none.nodes[n.id] }))
      .sort((a, b) => b.s.harm + b.s.downstream - (a.s.harm + a.s.downstream))
      .slice(0, 5)
      .map(({ n, s }) => ({
        name: n.name,
        hazard: KIND_LABEL[n.kind],
        pFail: pct(s.pFail),
        hour: Math.round(s.meanHour),
        downstreamHarm: Math.round(s.downstream),
      })),
    dominoPlan: plan.steps.map((st) => ({
      resource: RESOURCE[st.type].label,
      site: name(st.target),
      action: actionFor(st.type, byId.get(st.target)!.kind),
      harmPrevented: Math.round(st.gain),
    })),
    hazardFirstPlan: (Object.keys(naiveAlloc) as (keyof Allocation)[]).flatMap((t) =>
      naiveAlloc[t].map((id) => ({ resource: RESOURCE[t].label, site: name(id) })),
    ),
    timeline: likely.slice(0, 6).map(({ n, s }) => ({
      hour: Math.round(s.meanHour),
      event: `${KIND_LABEL[n.kind]}: ${n.name}`,
      probability: pct(s.pFail),
    })),
  };
}

/** Deterministic briefing used when no model key is configured (or the call fails). */
export function ruleBrief(f: BriefFacts): string {
  const saved = f.harm.noAction - f.harm.domino;
  const savedNaive = f.harm.noAction - f.harm.hazardFirst;
  const lines: string[] = [];
  lines.push("## Situation");
  lines.push(
    `${f.rainfallMm} mm of rain over 24 hours${f.highTide ? ", with the heaviest band arriving at high tide" : ""}. ` +
      `Across 1,000 simulated storms, about ${f.expectedFailures} sites fail` +
      (f.firstFailure ? `; the first is likely ${f.firstFailure.name} (${f.firstFailure.hazard.toLowerCase()}) around hour ${f.firstFailure.hour}.` : "."),
  );
  if (f.topChains.length) {
    lines.push("## Most likely cascade");
    const c = f.topChains[0];
    lines.push(`${c.path.join(" → ")} (${c.probability} of storms, ${fmt(c.harm)} people at serious risk).`);
  }
  lines.push("## Priority actions");
  f.dominoPlan.slice(0, 5).forEach((s, i) => {
    lines.push(`${i + 1}. ${s.resource} → ${s.site}: ${s.action.toLowerCase()} (prevents ~${fmt(s.harmPrevented)}).`);
  });
  lines.push("## Why this plan");
  lines.push(
    `The Domino plan prevents ~${fmt(saved)} people from serious harm versus ~${fmt(savedNaive)} for a hazard-first plan ` +
      `that sends the same resources where flooding looks worst. It cuts secondary-disaster harm from ${fmt(f.cascadeHarm.noAction)} ` +
      `to ${fmt(f.cascadeHarm.domino)} by protecting the substations and pumping stations that the cascades run through.`,
  );
  if (f.timeline.length) {
    lines.push("## Watch list");
    for (const t of f.timeline.slice(0, 4)) lines.push(`- Hour ${t.hour}: ${t.event} (${t.probability})`);
  }
  return lines.join("\n");
}
