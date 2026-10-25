"use client";

import dynamic from "next/dynamic";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { MUMBAI } from "@/lib/sim/mumbai";
import { HORIZON, emptyAllocation, hazardFirst, optimise, rainProfile, simulate } from "@/lib/sim/engine";
import { buildFacts } from "@/lib/sim/brief";
import type { Allocation, Budget, CityNode, ResourceType } from "@/lib/sim/types";
import { KIND_ICON, KIND_LABEL, RAMP_CSS, RESOURCE, actionFor, fmt, fmtK, pct, riskColor } from "@/lib/ui";
import Compare, { STRATEGY_LABEL, type Strategy } from "./Compare";
import Timeline from "./Timeline";
import Brief from "./Brief";
import About from "./About";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <div className="grid h-full w-full place-items-center text-sm text-ink-3">Loading map…</div>,
});

const PRESETS = [
  { mm: 150, label: "Heavy" },
  { mm: 250, label: "Very heavy" },
  { mm: 400, label: "Extreme" },
  { mm: 944, label: "26 Jul 2005" },
];

const MAX_BUDGET: Budget = { rescue: 12, generator: 6, purifier: 4 };

type Tab = "plan" | "risk" | "chains" | "brief";

function Glyph({ kind, className = "h-3.5 w-3.5" }: { kind: CityNode["kind"]; className?: string }) {
  return <span className={`inline-block shrink-0 ${className}`} dangerouslySetInnerHTML={{ __html: KIND_ICON[kind] }} />;
}

export default function Dashboard() {
  const city = MUMBAI;
  const byId = useMemo(() => new Map(city.nodes.map((n) => [n.id, n])), [city]);

  const [rainfall, setRainfall] = useState(300);
  const [highTide, setHighTide] = useState(true);
  const [budget, setBudget] = useState<Budget>({ rescue: 8, generator: 3, purifier: 2 });
  const [strategy, setStrategy] = useState<Strategy>("domino");
  const [hour, setHour] = useState(HORIZON);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("plan");
  const [about, setAbout] = useState(false);
  const [played, setPlayed] = useState(false);

  // Show the explainer once per browser, for judges opening the link cold.
  useEffect(() => {
    if (!localStorage.getItem("domino-seen-about")) {
      // localStorage only exists after hydration, so this has to run in an effect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAbout(true);
      localStorage.setItem("domino-seen-about", "1");
    }
  }, []);

  const scenario = useMemo(() => ({ rainfall, highTide }), [rainfall, highTide]);
  const dScenario = useDeferredValue(scenario);
  const dBudget = useDeferredValue(budget);

  const model = useMemo(() => {
    const none = simulate(city, dScenario, emptyAllocation());
    const naiveAlloc = hazardFirst(city, none, dBudget);
    const naive = simulate(city, dScenario, naiveAlloc);
    const plan = optimise(city, dScenario, dBudget);
    const domino = simulate(city, dScenario, plan.alloc);
    return { none, naive, domino, naiveAlloc, plan };
  }, [city, dScenario, dBudget]);

  const results = { none: model.none, naive: model.naive, domino: model.domino };
  const active = results[strategy];
  const alloc: Allocation =
    strategy === "domino" ? model.plan.alloc : strategy === "naive" ? model.naiveAlloc : emptyAllocation();
  const rain = useMemo(() => rainProfile(dScenario.rainfall), [dScenario.rainfall]);
  const failuresByHour = useMemo(
    () =>
      Array.from({ length: HORIZON + 1 }, (_, h) =>
        Object.values(active.nodes).reduce((s, n) => s + n.byHour[h], 0),
      ),
    [active],
  );
  const facts = useMemo(
    () => buildFacts(city, dScenario, model.none, model.naive, model.domino, model.naiveAlloc, model.plan),
    [city, dScenario, model],
  );

  // Storm playback
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setHour((h) => {
        if (h >= HORIZON) {
          setPlaying(false);
          return HORIZON;
        }
        return h + 1;
      });
    }, 230);
    return () => clearInterval(id);
  }, [playing]);

  const togglePlay = () => {
    if (playing) return setPlaying(false);
    if (hour >= HORIZON) setHour(0);
    setPlayed(true);
    setPlaying(true);
  };

  const firstFail = useMemo(() => {
    const list = city.nodes
      .map((n) => ({ n, s: model.none.nodes[n.id] }))
      .filter((x) => x.s.pFail >= 0.5)
      .sort((a, b) => a.s.meanHour - b.s.meanHour);
    return list[0];
  }, [city, model.none]);

  const prevented = model.none.totalHarm - active.totalHarm;
  const naivePrevented = model.none.totalHarm - model.naive.totalHarm;
  const dominoPrevented = model.none.totalHarm - model.domino.totalHarm;
  const advantage = naivePrevented > 0 ? dominoPrevented / naivePrevented : 0;

  const vulnerable = useMemo(
    () =>
      city.nodes
        .map((n) => ({ n, s: model.none.nodes[n.id] }))
        .sort((a, b) => b.s.harm + b.s.downstream - (a.s.harm + a.s.downstream))
        .slice(0, 10),
    [city, model.none],
  );

  // Expected failure events for the live feed: when each likely failure happens and what usually causes it.
  const events = useMemo(() => {
    return city.nodes
      .map((n) => {
        const st = active.nodes[n.id];
        let cause = "rain";
        if (st.pDirect < 0.5) {
          const parents = city.edges
            .filter((e) => e.to === n.id)
            .sort((a, b) => active.nodes[b.from].pFail * b.p - active.nodes[a.from].pFail * a.p);
          if (parents[0]) cause = `${byId.get(parents[0].from)!.short}: ${parents[0].label}`;
        }
        // Median failure hour: the first hour by which half of its failures have happened.
        const at = st.byHour.findIndex((x) => x >= st.pFail / 2);
        return { n, p: st.pFail, at, cause };
      })
      .filter((e) => e.p >= 0.4 && e.at >= 0)
      .sort((a, b) => a.at - b.at);
  }, [city, active, byId]);
  const feed = events.filter((e) => e.at <= hour).slice(-5).reverse();
  const showFeed = playing || hour < HORIZON;

  const sel = selected ? byId.get(selected) : null;

  return (
    <div className="flex min-h-screen flex-col lg:h-screen lg:overflow-hidden">
      <About open={about} onClose={() => setAbout(false)} />
      {/* Header */}
      <header className="flex items-center justify-between gap-4 border-b border-line bg-panel px-4 py-2.5">
        <div className="flex items-center gap-3">
          <Logo />
          <div>
            <h1 className="text-[15px] font-semibold leading-tight tracking-tight">Domino</h1>
            <p className="text-[11px] leading-tight text-ink-3">Disaster cascade prediction &amp; response planning</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <button
            onClick={() => setAbout(true)}
            className="rounded-full border border-line-2 px-2.5 py-1 text-ink-2 transition hover:border-ink-3 hover:text-ink"
          >
            How it works
          </button>
          <span className="hidden rounded-full border border-line-2 px-2.5 py-1 text-ink-2 md:inline">
            {city.name} · monsoon scenario
          </span>
          <span
            className="whitespace-nowrap rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 text-warning"
            title="Locations are real; populations, thresholds and dependency probabilities are illustrative."
          >
            Simulated data
          </span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Left: scenario + resources */}
        <aside className="scroll-thin order-2 w-full shrink-0 space-y-5 overflow-y-auto border-line bg-panel p-4 lg:order-1 lg:w-[290px] lg:border-r">
          <section>
            <SectionTitle>Storm</SectionTitle>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-xs text-ink-2">Rainfall in 24 h</span>
              <span className="num text-xl font-semibold">
                {rainfall}
                <span className="ml-1 text-xs font-normal text-ink-3">mm</span>
              </span>
            </div>
            <input
              type="range"
              className="slider w-full"
              min={80}
              max={950}
              step={10}
              value={rainfall}
              onChange={(e) => setRainfall(Number(e.target.value))}
              aria-label="Rainfall in 24 hours (mm)"
            />
            <div className="mt-2.5 grid grid-cols-4 gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.mm}
                  onClick={() => setRainfall(p.mm)}
                  className={`rounded-md border px-1 py-1.5 text-center text-[10px] leading-tight transition ${
                    rainfall === p.mm ? "border-accent text-ink" : "border-line text-ink-3 hover:border-line-2 hover:text-ink-2"
                  }`}
                >
                  <span className="num block font-semibold">{p.mm}</span>
                  {p.label}
                </button>
              ))}
            </div>
            <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-line px-3 py-2">
              <span>
                <span className="block text-xs text-ink">Peak rain at high tide</span>
                <span className="block text-[11px] text-ink-3">Sea outfalls close, drains back up</span>
              </span>
              <Switch on={highTide} onChange={setHighTide} label="Peak rain at high tide" />
            </label>
          </section>

          <section>
            <SectionTitle>Resources available</SectionTitle>
            <div className="space-y-2">
              {(Object.keys(RESOURCE) as ResourceType[]).map((t) => (
                <div key={t} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
                  <span className="flex items-center gap-2">
                    <span className="badge-static">{RESOURCE[t].badge}</span>
                    <span className="text-xs text-ink">{RESOURCE[t].plural}</span>
                  </span>
                  <Stepper
                    value={budget[t]}
                    max={MAX_BUDGET[t]}
                    onChange={(v) => setBudget((b) => ({ ...b, [t]: v }))}
                    label={RESOURCE[t].plural}
                  />
                </div>
              ))}
            </div>
          </section>

          <section>
            <SectionTitle>Response plan shown on map</SectionTitle>
            <div className="grid grid-cols-3 gap-1 rounded-lg border border-line p-1">
              {(["none", "naive", "domino"] as Strategy[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setStrategy(s)}
                  className={`rounded-md px-1 py-1.5 text-[11px] font-medium transition ${
                    strategy === s ? (s === "domino" ? "bg-accent text-[#1a0d06]" : "bg-ink text-bg") : "text-ink-3 hover:text-ink"
                  }`}
                >
                  {s === "none" ? "No action" : s === "naive" ? "Hazard-first" : "Domino"}
                </button>
              ))}
            </div>
          </section>

          <section>
            <SectionTitle>Legend</SectionTitle>
            <div className="mb-1 h-2.5 w-full rounded-full" style={{ background: RAMP_CSS }} />
            <div className="mb-3 flex justify-between text-[10px] text-ink-3">
              <span>0%</span>
              <span>Chance the site fails by the selected hour</span>
              <span>100%</span>
            </div>
            <ul className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[11px] text-ink-2">
              {(Object.keys(KIND_LABEL) as CityNode["kind"][]).map((k) => (
                <li key={k} className="flex items-center gap-1.5">
                  <Glyph kind={k} />
                  {KIND_LABEL[k]}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
              Lines are dependencies. They light up and flow when a failure spreads along them. Badges show where resources are
              sent: <b className="text-ink-2">T</b> team, <b className="text-ink-2">G</b> generator, <b className="text-ink-2">W</b>{" "}
              water purification.
            </p>
          </section>
        </aside>

        {/* Center: map + timeline */}
        <main className="order-1 flex min-h-0 flex-1 flex-col lg:order-2">
          <div className="relative h-[58vh] min-h-[360px] lg:h-auto lg:flex-1">
            <MapView
              city={city}
              result={active}
              hour={hour}
              alloc={alloc}
              selected={selected}
              onSelect={setSelected}
            />
            {/* Headline overlay */}
            <div className="pointer-events-none absolute left-3 top-3 z-[500] flex flex-wrap gap-2">
              <Chip>
                <span className="text-ink-3">{STRATEGY_LABEL[strategy]}</span>
                <span className="num font-semibold">{fmt(active.totalHarm)}</span>
                <span className="text-ink-3">people at serious risk</span>
              </Chip>
              {strategy !== "none" && (
                <Chip accent>
                  <span className="num font-semibold">−{fmt(prevented)}</span>
                  <span>vs no action</span>
                </Chip>
              )}
            </div>
            {showFeed && (
              <div className="pointer-events-none absolute right-3 top-3 z-[500] w-[min(300px,calc(100%-24px))] rounded-xl border border-line-2 bg-panel/90 p-3 shadow-2xl backdrop-blur">
                <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-ink-3">
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-critical" /> Live incident feed
                  </span>
                  <span className="num">Hour {Math.round(hour)}</span>
                </div>
                {feed.length === 0 && <p className="text-xs text-ink-3">Rain building. No failures expected yet.</p>}
                <ul className="space-y-2">
                  {feed.map((e, i) => (
                    <li key={e.n.id} className={`flex gap-2 ${i === 0 ? "" : "opacity-70"}`}>
                      <span
                        className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full"
                        style={{ background: riskColor(e.p), color: e.p > 0.55 ? "#1a0d06" : "#f0efec" }}
                      >
                        <Glyph kind={e.n.kind} className="h-3 w-3" />
                      </span>
                      <span className="min-w-0 text-xs leading-snug">
                        <span className="text-ink">
                          <span className="num text-ink-3">h{Math.round(e.at)}</span> {KIND_LABEL[e.n.kind]} · {e.n.short}
                        </span>
                        <span className="block truncate text-[11px] text-ink-3">
                          {pct(e.p)} likely · {e.cause === "rain" ? "rain past threshold" : `via ${e.cause}`}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {sel && (
              <NodeCard
                node={sel}
                city={city}
                base={model.none.nodes[sel.id]}
                now={active.nodes[sel.id]}
                strategy={strategy}
                alloc={alloc}
                byId={byId}
                onClose={() => setSelected(null)}
                onSelect={setSelected}
              />
            )}
          </div>
          <Timeline
            rain={rain}
            hour={hour}
            playing={playing}
            failuresByHour={failuresByHour}
            onHour={(h) => {
              setPlaying(false);
              setHour(h);
            }}
            onPlay={togglePlay}
            hint={!played}
          />
        </main>

        {/* Right: analysis */}
        <aside className="order-3 flex w-full shrink-0 flex-col border-line bg-panel lg:w-[380px] lg:border-l">
          <nav className="flex border-b border-line px-2" role="tablist">
            {(
              [
                ["plan", "Plan"],
                ["risk", "Vulnerable"],
                ["chains", "Cascades"],
                ["brief", "AI brief"],
              ] as [Tab, string][]
            ).map(([t, label]) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`relative px-3 py-3 text-xs font-medium transition ${tab === t ? "text-ink" : "text-ink-3 hover:text-ink-2"}`}
              >
                {label}
                {tab === t && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent" />}
              </button>
            ))}
          </nav>

          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-4">
            {tab === "plan" && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-2">
                  <Kpi label="People at serious risk" value={fmt(active.totalHarm)} sub={STRATEGY_LABEL[strategy]} />
                  <Kpi
                    label="Harm prevented"
                    value={strategy === "none" ? "–" : fmt(prevented)}
                    sub={strategy === "none" ? "no resources sent" : `${pct(prevented / model.none.totalHarm)} vs no action`}
                    accent={strategy === "domino"}
                  />
                  <Kpi
                    label="Secondary-disaster harm"
                    value={fmt(active.cascadeHarm)}
                    sub={
                      strategy === "none"
                        ? `${pct(active.cascadeHarm / active.totalHarm)} of all harm`
                        : `−${pct(1 - active.cascadeHarm / model.none.cascadeHarm)} vs no action`
                    }
                  />
                  <Kpi
                    label="First failure expected"
                    value={firstFail ? `Hour ${Math.round(firstFail.s.meanHour)}` : "None"}
                    sub={firstFail ? firstFail.n.short : "below thresholds"}
                  />
                </div>

                {advantage > 1.02 && (
                  <div className="rounded-lg border border-accent/40 bg-accent/10 p-3 text-[13px] leading-relaxed text-ink-2">
                    With the same resources, the Domino plan prevents{" "}
                    <b className="text-ink">{Math.round((advantage - 1) * 100)}% more harm</b> than a hazard-first plan and cuts
                    secondary-disaster harm by{" "}
                    <b className="text-ink">{pct(1 - model.domino.cascadeHarm / model.none.cascadeHarm)}</b> (hazard-first:{" "}
                    {pct(1 - model.naive.cascadeHarm / model.none.cascadeHarm)}). It protects the substations and pumping
                    stations that floods spread through, not just the places that flood worst.
                  </div>
                )}

                <div>
                  <SectionTitle>Plans compared · same resources</SectionTitle>
                  <Compare results={results} active={strategy} onPick={setStrategy} />
                </div>

                <div>
                  <SectionTitle>
                    {strategy === "domino" ? "Domino plan · in order of impact" : strategy === "naive" ? "Hazard-first plan" : "No resources sent"}
                  </SectionTitle>
                  {strategy === "domino" && (
                    <ol className="space-y-1.5">
                      {model.plan.steps.map((st, i) => {
                        const node = byId.get(st.target)!;
                        return (
                          <li key={`${st.type}-${st.target}`}>
                            <button
                              onClick={() => setSelected(node.id)}
                              className="flex w-full items-center gap-2.5 rounded-lg border border-line px-2.5 py-2 text-left transition hover:border-line-2"
                            >
                              <span className="num w-4 text-[11px] text-ink-3">{i + 1}</span>
                              <span className="badge-static">{RESOURCE[st.type].badge}</span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-xs text-ink">{node.short}</span>
                                <span className="block truncate text-[11px] text-ink-3">{actionFor(st.type, node.kind)}</span>
                              </span>
                              <span className="num text-xs font-semibold text-good">−{fmtK(st.gain)}</span>
                            </button>
                          </li>
                        );
                      })}
                      {model.plan.steps.length === 0 && <p className="text-xs text-ink-3">No resource reduces harm in this storm.</p>}
                    </ol>
                  )}
                  {strategy === "naive" && (
                    <>
                      <p className="mb-2 text-[11px] text-ink-3">
                        The usual playbook: teams where direct flooding looks worst, generators to the biggest hospitals,
                        purifiers to the biggest supply zones. It doesn&apos;t model cascades.
                      </p>
                      <ul className="space-y-1.5">
                        {(Object.keys(model.naiveAlloc) as ResourceType[]).flatMap((t) =>
                          model.naiveAlloc[t].map((id) => {
                            const node = byId.get(id)!;
                            return (
                              <li key={`${t}-${id}`}>
                                <button
                                  onClick={() => setSelected(id)}
                                  className="flex w-full items-center gap-2.5 rounded-lg border border-line px-2.5 py-2 text-left hover:border-line-2"
                                >
                                  <span className="badge-static">{RESOURCE[t].badge}</span>
                                  <span className="flex-1 truncate text-xs text-ink">{node.short}</span>
                                  <span className="text-[11px] text-ink-3">{actionFor(t, node.kind)}</span>
                                </button>
                              </li>
                            );
                          }),
                        )}
                      </ul>
                    </>
                  )}
                  {strategy === "none" && (
                    <p className="text-xs text-ink-3">Switch to the Domino plan to see where to send teams and supplies.</p>
                  )}
                </div>
              </div>
            )}

            {tab === "risk" && (
              <div>
                <p className="mb-3 text-[13px] text-ink-3">
                  Ranked by the harm a site causes itself <i>plus</i> the harm it triggers downstream, with no action taken.
                </p>
                <div className="mb-2 flex items-center gap-4 text-[11px] text-ink-2">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-direct" /> Own harm
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-cascade" /> Harm it triggers
                  </span>
                </div>
                <ol className="space-y-1.5">
                  {vulnerable.map(({ n, s }, i) => {
                    const max = vulnerable[0].s.harm + vulnerable[0].s.downstream;
                    return (
                      <li key={n.id}>
                        <button
                          onClick={() => setSelected(n.id)}
                          className={`w-full rounded-lg border px-2.5 py-2 text-left transition ${
                            selected === n.id ? "border-ink-2 bg-panel-2" : "border-line hover:border-line-2"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="num w-4 text-[11px] text-ink-3">{i + 1}</span>
                            <span
                              className="grid h-5 w-5 place-items-center rounded-full"
                              style={{ background: riskColor(s.pFail), color: s.pFail > 0.55 ? "#1a0d06" : "#f0efec" }}
                            >
                              <Glyph kind={n.kind} className="h-3 w-3" />
                            </span>
                            <span className="min-w-0 flex-1 truncate text-xs text-ink">{n.short}</span>
                            <span className="num text-[11px] text-ink-2">
                              {pct(s.pFail)} · h{Number.isFinite(s.meanHour) ? Math.round(s.meanHour) : "–"}
                            </span>
                          </div>
                          <div className="mt-1.5 flex h-2 gap-[2px] pl-6">
                            <div className="rounded-l-[3px] bg-direct" style={{ width: `${(s.harm / max) * 100}%` }} />
                            {s.downstream > 1 && (
                              <div className="rounded-r-[3px] bg-cascade" style={{ width: `${(s.downstream / max) * 100}%` }} />
                            )}
                          </div>
                          <div className="mt-1 flex justify-between pl-6 text-[10px] text-ink-3 num">
                            <span>{KIND_LABEL[n.kind]}</span>
                            <span>
                              {fmt(s.harm)} own{s.downstream > 1 ? ` + ${fmt(s.downstream)} triggered` : ""}
                            </span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}

            {tab === "chains" && (
              <div>
                <p className="mb-3 text-[13px] text-ink-3">
                  The failure chains that do the most damage across 1,000 simulated storms, with no action taken.
                </p>
                <ol className="space-y-3">
                  {model.none.chains.slice(0, 6).map((c) => (
                    <li key={c.path.join(">")} className="rounded-lg border border-line p-3">
                      <div className="mb-2 flex items-baseline justify-between text-[11px]">
                        <span className="text-ink-3">
                          In <b className="num text-ink">{pct(c.prob)}</b> of storms
                        </span>
                        <span className="num text-ink-2">{fmt(c.harm)} at serious risk</span>
                      </div>
                      <div className="space-y-0">
                        {c.path.map((id, k) => {
                          const node = byId.get(id)!;
                          const edge = k > 0 ? city.edges.find((e) => e.from === c.path[k - 1] && e.to === id) : null;
                          return (
                            <div key={id}>
                              {edge && (
                                <div className="ml-[9px] border-l border-dashed border-line-2 py-1 pl-4 text-[10px] text-ink-3">
                                  {edge.label} · +{edge.delay}h
                                </div>
                              )}
                              <button onClick={() => setSelected(id)} className="flex items-center gap-2 text-left hover:underline">
                                <span
                                  className="grid h-5 w-5 place-items-center rounded-full"
                                  style={{
                                    background: riskColor(model.none.nodes[id].pFail),
                                    color: model.none.nodes[id].pFail > 0.55 ? "#1a0d06" : "#f0efec",
                                  }}
                                >
                                  <Glyph kind={node.kind} className="h-3 w-3" />
                                </span>
                                <span className="text-xs text-ink">{node.short}</span>
                                <span className="text-[10px] text-ink-3">{KIND_LABEL[node.kind]}</span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </li>
                  ))}
                  {model.none.chains.length === 0 && <p className="text-xs text-ink-3">No cascades at this rainfall.</p>}
                </ol>
              </div>
            )}

            {tab === "brief" && <Brief facts={facts} />}
          </div>
        </aside>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-3">{children}</h2>;
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-2.5 ${accent ? "border-accent/50 bg-accent/10" : "border-line bg-panel-2"}`}>
      <div className="text-[10px] uppercase tracking-wider text-ink-3">{label}</div>
      <div className={`num mt-0.5 text-lg font-semibold ${accent ? "text-accent" : "text-ink"}`}>{value}</div>
      <div className="truncate text-[11px] text-ink-3">{sub}</div>
    </div>
  );
}

function Chip({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <div
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs shadow-lg backdrop-blur ${
        accent ? "border-accent/50 bg-[#2a160c]/90 text-accent" : "border-line-2 bg-panel/90 text-ink"
      }`}
    >
      {children}
    </div>
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={(e) => {
        e.preventDefault();
        onChange(!on);
      }}
      className={`relative h-5 w-9 shrink-0 rounded-full transition ${on ? "bg-accent" : "bg-line-2"}`}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-ink transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
    </button>
  );
}

function Stepper({ value, max, onChange, label }: { value: number; max: number; onChange: (v: number) => void; label: string }) {
  const btn = "grid h-6 w-6 place-items-center rounded-md border border-line text-ink-2 transition hover:border-line-2 hover:text-ink disabled:opacity-30";
  return (
    <div className="flex items-center gap-1.5">
      <button className={btn} onClick={() => onChange(Math.max(0, value - 1))} disabled={value <= 0} aria-label={`Fewer ${label}`}>
        −
      </button>
      <span className="num w-5 text-center text-sm font-semibold">{value}</span>
      <button className={btn} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`More ${label}`}>
        +
      </button>
    </div>
  );
}

function NodeCard({
  node,
  city,
  base,
  now,
  strategy,
  alloc,
  byId,
  onClose,
  onSelect,
}: {
  node: CityNode;
  city: typeof MUMBAI;
  base: { pFail: number; meanHour: number; harm: number; downstream: number; pDirect: number };
  now: { pFail: number; harm: number };
  strategy: Strategy;
  alloc: Allocation;
  byId: Map<string, CityNode>;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const incoming = city.edges.filter((e) => e.to === node.id);
  const outgoing = city.edges.filter((e) => e.from === node.id);
  const sent = (Object.keys(alloc) as ResourceType[]).filter((t) => alloc[t].includes(node.id));
  return (
    <div className="absolute bottom-3 left-3 z-[600] w-[min(340px,calc(100%-24px))] rounded-xl border border-line-2 bg-panel/95 p-3.5 shadow-2xl backdrop-blur">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] text-ink-3">
            <Glyph kind={node.kind} className="h-3 w-3" /> {KIND_LABEL[node.kind]}
          </div>
          <div className="text-sm font-semibold">{node.name}</div>
        </div>
        <button onClick={onClose} className="rounded-md px-1.5 text-ink-3 hover:text-ink" aria-label="Close details">
          ✕
        </button>
      </div>
      <div className="mb-2.5 grid grid-cols-3 gap-2 text-center">
        <Mini label="Fails (no action)" value={pct(base.pFail)} />
        <Mini label={strategy === "none" ? "Usually at" : "With this plan"} value={strategy === "none" ? (Number.isFinite(base.meanHour) ? `Hour ${Math.round(base.meanHour)}` : "–") : pct(now.pFail)} />
        <Mini label="Triggers downstream" value={fmtK(base.downstream)} />
      </div>
      {base.pFail > 0 && (
        <p className="mb-2 text-[11px] text-ink-3">
          {node.threshold
            ? `Fails when 24 h rain passes ~${node.threshold} mm${node.kind === "flood" ? " (lower at high tide)" : ""}.`
            : `Never fails from rain alone. ${pct(1 - base.pDirect)} of its failures are cascades.`}
        </p>
      )}
      {sent.length > 0 && (
        <div className="mb-2 rounded-md bg-good/10 px-2 py-1.5 text-[11px] text-good">
          Sent: {sent.map((t) => `${RESOURCE[t].label} (${actionFor(t, node.kind).toLowerCase()})`).join(", ")}
        </div>
      )}
      {incoming.length > 0 && <EdgeList title="Fails because of" edges={incoming} pick="from" byId={byId} onSelect={onSelect} />}
      {outgoing.length > 0 && <EdgeList title="Can knock out" edges={outgoing} pick="to" byId={byId} onSelect={onSelect} />}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-panel-2 px-1.5 py-1.5">
      <div className="num text-sm font-semibold">{value}</div>
      <div className="text-[10px] leading-tight text-ink-3">{label}</div>
    </div>
  );
}

function EdgeList({
  title,
  edges,
  pick,
  byId,
  onSelect,
}: {
  title: string;
  edges: typeof MUMBAI.edges;
  pick: "from" | "to";
  byId: Map<string, CityNode>;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mt-2">
      <div className="mb-1 text-[10px] uppercase tracking-wider text-ink-3">{title}</div>
      <ul className="space-y-0.5">
        {edges.map((e) => {
          const other = byId.get(e[pick])!;
          return (
            <li key={`${e.from}-${e.to}`}>
              <button onClick={() => onSelect(other.id)} className="flex w-full items-center gap-1.5 text-left text-[11px] hover:underline">
                <Glyph kind={other.kind} className="h-3 w-3 text-ink-3" />
                <span className="text-ink">{other.short}</span>
                <span className="truncate text-ink-3">· {e.label}</span>
                <span className="num ml-auto text-ink-2">{pct(e.p)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#1d1d1b" />
      <rect x="7" y="9" width="5" height="14" rx="1.5" fill="#8d8c84" />
      <rect x="14" y="8" width="5" height="14" rx="1.5" fill="#c3c2b7" transform="rotate(14 16.5 15)" />
      <rect x="21" y="9" width="5" height="14" rx="1.5" fill="#ff7a3d" transform="rotate(32 23.5 16)" />
    </svg>
  );
}
