export type Kind = "flood" | "landslide" | "power" | "water" | "contam" | "hospital";

export type ResourceType = "rescue" | "generator" | "purifier";

export interface CityNode {
  id: string;
  name: string;
  short: string;
  kind: Kind;
  lat: number;
  lng: number;
  /** People exposed if this node fails (residents, customers served, or patients). */
  exposed: number;
  /** Harm per exposed person when the node fails (0..1). */
  severity: number;
  /** Cumulative rainfall (mm) at which the node fails directly. Only flood and landslide nodes. */
  threshold?: number;
}

export interface Edge {
  from: string;
  to: string;
  /** Chance the failure spreads along this edge. */
  p: number;
  /** Hours between the parent failing and this node failing. */
  delay: number;
  /** What carries the failure: inundation, lost power, broken supply, blocked access. */
  via: "flood" | "power" | "supply" | "access" | "debris";
  label: string;
}

export interface City {
  id: string;
  name: string;
  center: [number, number];
  zoom: number;
  nodes: CityNode[];
  edges: Edge[];
}

export interface Scenario {
  rainfall: number; // mm over 24h
  highTide: boolean;
}

export type Allocation = Record<ResourceType, string[]>;

export interface Budget {
  rescue: number;
  generator: number;
  purifier: number;
}

export interface NodeStat {
  id: string;
  pFail: number;
  /** Mean failure hour given it failed. */
  meanHour: number;
  /** P(failed by hour h) for h = 0..HORIZON. */
  byHour: number[];
  /** Expected harm from this node failing. */
  harm: number;
  /** Expected harm this node causes downstream through cascades. */
  downstream: number;
  /** Share of failures caused by rain directly (vs. a cascade). */
  pDirect: number;
}

export interface Chain {
  path: string[];
  prob: number;
  harm: number;
}

export interface SimResult {
  totalHarm: number;
  /** Harm from secondary disasters (failures caused by another failure, not by rain). */
  cascadeHarm: number;
  peopleAffected: number;
  expectedFailures: number;
  nodes: Record<string, NodeStat>;
  chains: Chain[];
  runs: number;
}

export interface PlanStep {
  type: ResourceType;
  target: string;
  gain: number;
}
