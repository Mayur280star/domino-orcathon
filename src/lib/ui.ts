import type { CityNode, ResourceType } from "./sim/types";

export const KIND_LABEL: Record<CityNode["kind"], string> = {
  flood: "Flood",
  landslide: "Landslide",
  power: "Power failure",
  water: "Water supply failure",
  contam: "Water contamination",
  hospital: "Hospital disruption",
};

export const RESOURCE: Record<ResourceType, { label: string; plural: string; badge: string }> = {
  rescue: { label: "Response team", plural: "Response teams", badge: "T" },
  generator: { label: "Mobile generator", plural: "Mobile generators", badge: "G" },
  purifier: { label: "Water purification unit", plural: "Purification units", badge: "W" },
};

/** What a resource does at a given kind of site, in a few words. */
export function actionFor(type: ResourceType, kind: CityNode["kind"]): string {
  if (type === "generator") return kind === "hospital" ? "Keeps wards powered" : "Keeps pumps running on grid loss";
  if (type === "purifier") return "Chlorination + tanker supply";
  if (kind === "flood") return "Evacuate + dewater";
  if (kind === "landslide") return "Pre-emptive evacuation";
  return "Sandbag + pump out the site";
}

// Inline SVG glyphs (stroke = currentColor) for each kind of node.
const P = 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
export const KIND_ICON: Record<CityNode["kind"], string> = {
  flood: `<svg viewBox="0 0 24 24" ${P}><path d="M2 9c2 0 2-1.5 4-1.5S8 9 10 9s2-1.5 4-1.5S16 9 18 9s2-1.5 4-1.5"/><path d="M2 15c2 0 2-1.5 4-1.5S8 15 10 15s2-1.5 4-1.5S16 15 18 15s2-1.5 4-1.5"/></svg>`,
  landslide: `<svg viewBox="0 0 24 24" ${P}><path d="M3 20 10 7l4 6 2-3 5 10Z"/></svg>`,
  power: `<svg viewBox="0 0 24 24" ${P}><path d="M13 2 4 14h7l-1 8 9-12h-7Z"/></svg>`,
  water: `<svg viewBox="0 0 24 24" ${P}><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z"/></svg>`,
  contam: `<svg viewBox="0 0 24 24" ${P}><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z"/><path d="M9 12l6 6M15 12l-6 6"/></svg>`,
  hospital: `<svg viewBox="0 0 24 24" ${P}><path d="M12 5v14M5 12h14"/></svg>`,
};

// Sequential ramp (one hue, orange) for failure probability on the dark map:
// dim near zero, brighter as risk rises.
const RAMP: [number, [number, number, number]][] = [
  [0, [58, 57, 54]],
  [0.15, [92, 58, 38]],
  [0.35, [138, 69, 35]],
  [0.55, [185, 83, 31]],
  [0.75, [224, 97, 42]],
  [1, [255, 140, 90]],
];

export function riskColor(p: number): string {
  const x = Math.max(0, Math.min(1, p));
  for (let i = 1; i < RAMP.length; i++) {
    const [b, cb] = RAMP[i];
    const [a, ca] = RAMP[i - 1];
    if (x <= b) {
      const t = (x - a) / (b - a);
      const c = ca.map((v, k) => Math.round(v + (cb[k] - v) * t));
      return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    }
  }
  return "rgb(255, 140, 90)";
}

export const RAMP_CSS = `linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map(riskColor).join(", ")})`;

export function fmt(n: number): string {
  if (!Number.isFinite(n)) return "–";
  return Math.round(n).toLocaleString("en-IN");
}

export function fmtK(n: number): string {
  if (Math.abs(n) >= 100000) return `${(n / 100000).toFixed(1)} L`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n)}`;
}

export function pct(p: number): string {
  return `${Math.round(p * 100)}%`;
}
