import type {
  Allocation,
  Budget,
  Chain,
  City,
  CityNode,
  NodeStat,
  PlanStep,
  ResourceType,
  Scenario,
  SimResult,
} from "./types";

export const HORIZON = 36; // hours simulated
export const RAIN_HOURS = 24;

const THRESHOLD_SPREAD = 0.22; // log-normal sigma on failure thresholds
const HIGH_TIDE_FACTOR = 0.85; // outfalls shut at high tide, so drains choke sooner

// What one unit of each resource does to the node it is sent to.
// A team can evacuate or assist only so many people, so in a big flooded ward it
// makes a dent rather than halving the damage.
const RESCUE_SHARE = { flood: 0.5, landslide: 0.85 } as const;
export const RESCUE_CAPACITY = 4000;
const RESCUE_EDGE = 0.3; // sandbagging cuts flood/debris spread into infrastructure
const GENERATOR_EDGE = 0.1; // mobile generator keeps the site running without grid power
const PURIFIER_HARM = 0.3; // chlorination + tankers

export const RESOURCE_TARGETS: Record<ResourceType, CityNode["kind"][]> = {
  rescue: ["flood", "landslide", "power", "water"],
  generator: ["water", "hospital"],
  purifier: ["contam"],
};

export function emptyAllocation(): Allocation {
  return { rescue: [], generator: [], purifier: [] };
}

/** Hourly rainfall (mm) for a 24h storm: a long main band plus a sharp evening burst. */
export function rainProfile(total: number): number[] {
  const w: number[] = [];
  for (let h = 0; h < RAIN_HOURS; h++) {
    const main = Math.exp(-((h - 8) ** 2) / (2 * 4 ** 2));
    const burst = 0.7 * Math.exp(-((h - 16) ** 2) / (2 * 2 ** 2));
    w.push(main + burst);
  }
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((x) => (x / sum) * total);
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Random draws shared by every plan we compare (common random numbers), so a
 * difference in harm comes from the plan, not from luck.
 */
interface Draws {
  runs: number;
  noise: Float64Array; // runs × nodes, threshold multiplier
  edgeU: Float64Array; // runs × edges, uniform for spread
}

const drawCache = new Map<string, Draws>();

function getDraws(city: City, runs: number, seed: number): Draws {
  const key = `${city.id}:${runs}:${seed}`;
  const hit = drawCache.get(key);
  if (hit) return hit;
  const rand = mulberry32(seed);
  const n = city.nodes.length;
  const m = city.edges.length;
  const noise = new Float64Array(runs * n);
  const edgeU = new Float64Array(runs * m);
  for (let r = 0; r < runs; r++) {
    for (let i = 0; i < n; i++) {
      const u1 = Math.max(rand(), 1e-12);
      const u2 = rand();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      noise[r * n + i] = Math.exp(THRESHOLD_SPREAD * z);
    }
    for (let e = 0; e < m; e++) edgeU[r * m + e] = rand();
  }
  const draws = { runs, noise, edgeU };
  drawCache.set(key, draws);
  return draws;
}

interface Prepared {
  n: number;
  m: number;
  cumRain: number[];
  threshold: Float64Array; // NaN when the node does not fail from rain directly
  harm: Float64Array; // harm if failed, after mitigation
  edgeFrom: Int32Array;
  edgeTo: Int32Array;
  edgeDelay: Float64Array;
  edgeP: Float64Array; // after mitigation
}

function prepare(city: City, scenario: Scenario, alloc: Allocation): Prepared {
  const n = city.nodes.length;
  const m = city.edges.length;
  const idx = new Map(city.nodes.map((x, i) => [x.id, i]));
  const rain = rainProfile(scenario.rainfall);
  const cumRain: number[] = [];
  let acc = 0;
  for (let h = 0; h <= HORIZON; h++) {
    acc += h < RAIN_HOURS ? rain[h] : 0;
    cumRain.push(acc);
  }

  const rescue = new Set(alloc.rescue);
  const generator = new Set(alloc.generator);
  const purifier = new Set(alloc.purifier);

  const threshold = new Float64Array(n);
  const harm = new Float64Array(n);
  city.nodes.forEach((node, i) => {
    let t = node.threshold ?? NaN;
    if (node.kind === "flood" && scenario.highTide) t *= HIGH_TIDE_FACTOR;
    threshold[i] = t;
    let h = node.exposed * node.severity;
    if (rescue.has(node.id) && (node.kind === "flood" || node.kind === "landslide"))
      h -= Math.min(h * RESCUE_SHARE[node.kind], RESCUE_CAPACITY);
    if (purifier.has(node.id) && node.kind === "contam") h *= PURIFIER_HARM;
    harm[i] = h;
  });

  const edgeFrom = new Int32Array(m);
  const edgeTo = new Int32Array(m);
  const edgeDelay = new Float64Array(m);
  const edgeP = new Float64Array(m);
  city.edges.forEach((e, k) => {
    edgeFrom[k] = idx.get(e.from)!;
    edgeTo[k] = idx.get(e.to)!;
    edgeDelay[k] = e.delay;
    let p = e.p;
    if (rescue.has(e.to) && (e.via === "flood" || e.via === "debris")) p *= RESCUE_EDGE;
    if (generator.has(e.to) && e.via === "power") p *= GENERATOR_EDGE;
    edgeP[k] = p;
  });

  return { n, m, cumRain, threshold, harm, edgeFrom, edgeTo, edgeDelay, edgeP };
}

/**
 * One storm: rain fails nodes whose threshold it crosses, then failures spread
 * along dependency edges. Writes failure hour (Infinity = survived) and the edge
 * that caused it (-1 = rain) into the given arrays.
 */
function runOnce(P: Prepared, D: Draws, r: number, time: Float64Array, cause: Int32Array) {
  const { n, m, cumRain, threshold, edgeFrom, edgeTo, edgeDelay, edgeP } = P;
  for (let i = 0; i < n; i++) {
    time[i] = Infinity;
    cause[i] = -1;
    const t = threshold[i];
    if (Number.isNaN(t)) continue;
    const limit = t * D.noise[r * n + i];
    for (let h = 0; h <= HORIZON; h++) {
      if (cumRain[h] >= limit) {
        time[i] = h;
        break;
      }
    }
  }
  // Earliest failure time along fired edges (Bellman-Ford; the graph is tiny).
  for (let pass = 0; pass < n; pass++) {
    let changed = false;
    for (let k = 0; k < m; k++) {
      const a = edgeFrom[k];
      if (time[a] === Infinity || D.edgeU[r * m + k] >= edgeP[k]) continue;
      const t = time[a] + edgeDelay[k];
      const b = edgeTo[k];
      if (t < time[b] && t <= HORIZON) {
        time[b] = t;
        cause[b] = k;
        changed = true;
      }
    }
    if (!changed) break;
  }
}

/** Expected harm only — the fast path the optimiser calls hundreds of times. */
function expectedHarm(P: Prepared, D: Draws): number {
  const time = new Float64Array(P.n);
  const cause = new Int32Array(P.n);
  let total = 0;
  for (let r = 0; r < D.runs; r++) {
    runOnce(P, D, r, time, cause);
    for (let i = 0; i < P.n; i++) if (time[i] !== Infinity) total += P.harm[i];
  }
  return total / D.runs;
}

export function simulate(
  city: City,
  scenario: Scenario,
  alloc: Allocation,
  runs = 1000,
  seed = 7,
): SimResult {
  const P = prepare(city, scenario, alloc);
  const D = getDraws(city, runs, seed);
  const { n } = P;
  const time = new Float64Array(n);
  const cause = new Int32Array(n);

  const fails = new Float64Array(n);
  const direct = new Float64Array(n);
  const hourSum = new Float64Array(n);
  const harmSum = new Float64Array(n);
  const downstream = new Float64Array(n);
  const hourHist = Array.from({ length: n }, () => new Float64Array(HORIZON + 1));
  const chainStats = new Map<string, { count: number; harm: number }>();
  let total = 0;
  let cascadeTotal = 0;
  let failures = 0;

  for (let r = 0; r < runs; r++) {
    runOnce(P, D, r, time, cause);
    for (let i = 0; i < n; i++) {
      if (time[i] === Infinity) continue;
      const h = P.harm[i];
      fails[i]++;
      failures++;
      if (cause[i] === -1) direct[i]++;
      hourSum[i] += time[i];
      hourHist[i][Math.min(HORIZON, Math.ceil(time[i]))]++;
      harmSum[i] += h;
      total += h;

      if (cause[i] === -1) continue;
      cascadeTotal += h;
      // Walk back to the rain-triggered root; credit each ancestor with this harm.
      const path = [i];
      let j = i;
      while (cause[j] !== -1 && path.length <= n) {
        j = P.edgeFrom[cause[j]];
        downstream[j] += h;
        path.push(j);
      }
      const key = path.reverse().join(">");
      const s = chainStats.get(key) ?? { count: 0, harm: 0 };
      s.count++;
      s.harm += h;
      chainStats.set(key, s);
    }
  }

  const nodes: Record<string, NodeStat> = {};
  city.nodes.forEach((node, i) => {
    const byHour: number[] = [];
    let acc = 0;
    for (let h = 0; h <= HORIZON; h++) {
      acc += hourHist[i][h];
      byHour.push(acc / runs);
    }
    nodes[node.id] = {
      id: node.id,
      pFail: fails[i] / runs,
      meanHour: fails[i] ? hourSum[i] / fails[i] : NaN,
      byHour,
      harm: harmSum[i] / runs,
      downstream: downstream[i] / runs,
      pDirect: fails[i] ? direct[i] / fails[i] : 0,
    };
  });

  const ranked: Chain[] = [...chainStats.entries()]
    .map(([key, s]) => ({
      path: key.split(">").map((k) => city.nodes[Number(k)].id),
      prob: s.count / runs,
      harm: s.harm / runs,
    }))
    .sort((a, b) => b.harm - a.harm);
  // Drop chains that are just the start of a longer chain already listed.
  const chains: Chain[] = [];
  for (const c of ranked) {
    const key = c.path.join(">");
    if (chains.some((k) => k.path.join(">").startsWith(key + ">"))) continue;
    chains.push(c);
    if (chains.length === 8) break;
  }

  // People living or treated where something failed (power and water nodes are
  // counted through the supply zones and hospitals they feed).
  const peopleAffected = city.nodes.reduce(
    (s, node, i) => (node.kind === "power" || node.kind === "water" ? s : s + (fails[i] / runs) * node.exposed),
    0,
  );

  return { totalHarm: total / runs, cascadeHarm: cascadeTotal / runs, peopleAffected, expectedFailures: failures / runs, nodes, chains, runs };
}

export interface Plan {
  alloc: Allocation;
  steps: PlanStep[];
}

/**
 * Cascade-aware allocation: greedily place one unit at a time wherever it cuts
 * the most expected harm, re-simulating the whole cascade for every candidate.
 */
export function optimise(
  city: City,
  scenario: Scenario,
  budget: Budget,
  runs = 300,
  seed = 11,
): Plan {
  const D = getDraws(city, runs, seed);
  const alloc = emptyAllocation();
  const left = { ...budget };
  const steps: PlanStep[] = [];
  let current = expectedHarm(prepare(city, scenario, alloc), D);

  const types: ResourceType[] = ["rescue", "generator", "purifier"];
  for (;;) {
    let best: PlanStep | null = null;
    let bestHarm = current;
    for (const type of types) {
      if (left[type] <= 0) continue;
      for (const node of city.nodes) {
        if (!RESOURCE_TARGETS[type].includes(node.kind) || alloc[type].includes(node.id)) continue;
        const trial = { ...alloc, [type]: [...alloc[type], node.id] };
        const h = expectedHarm(prepare(city, scenario, trial), D);
        if (h < bestHarm - 1e-9) {
          bestHarm = h;
          best = { type, target: node.id, gain: current - h };
        }
      }
    }
    if (!best) break;
    alloc[best.type].push(best.target);
    left[best.type]--;
    steps.push(best);
    current = bestHarm;
  }
  return { alloc, steps };
}

/**
 * The usual playbook: rescue teams where the direct hazard looks worst, generators
 * to the biggest hospitals, purifiers to the biggest supply zones. Ignores cascades.
 */
export function hazardFirst(city: City, base: SimResult, budget: Budget): Allocation {
  const direct = (node: CityNode) => {
    const s = base.nodes[node.id];
    return s.pFail * s.pDirect * node.exposed * node.severity;
  };
  const pick = (kinds: CityNode["kind"][], score: (x: CityNode) => number, k: number) =>
    city.nodes
      .filter((x) => kinds.includes(x.kind))
      .sort((a, b) => score(b) - score(a))
      .slice(0, k)
      .map((x) => x.id);
  return {
    rescue: pick(["flood", "landslide"], direct, budget.rescue),
    generator: pick(["hospital"], (x) => x.exposed, budget.generator),
    purifier: pick(["contam"], (x) => x.exposed, budget.purifier),
  };
}
