"use client";

import { useEffect, useRef } from "react";
import type * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Allocation, City, CityNode, SimResult } from "@/lib/sim/types";
import { KIND_ICON, KIND_LABEL, RESOURCE, fmt, pct, riskColor } from "@/lib/ui";

interface Props {
  city: City;
  result: SimResult;
  hour: number;
  alloc: Allocation;
  selected: string | null;
  onSelect: (id: string | null) => void;
}

function nodeSize(node: CityNode) {
  const base = Math.sqrt(node.exposed * node.severity);
  return Math.round(Math.max(20, Math.min(34, 12 + base / 7)));
}

export default function MapView({ city, result, hour, alloc, selected, onSelect }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const lib = useRef<typeof L | null>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef(new Map<string, L.Marker>());
  const lines = useRef<{ edge: City["edges"][number]; line: L.Polyline }[]>([]);
  const latest = useRef({ result, hour, alloc, selected });
  latest.current = { result, hour, alloc, selected };
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  // Build the map once.
  useEffect(() => {
    let cancelled = false;
    let resize: ResizeObserver | undefined;
    const markerMap = markers.current;
    (async () => {
      const Lf = await import("leaflet");
      if (cancelled || !el.current) return;
      lib.current = Lf;
      const m = Lf.map(el.current, { zoomControl: false, attributionControl: true }).setView(city.center, city.zoom);
      Lf.control.zoom({ position: "bottomright" }).addTo(m);
      const esri = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas";
      Lf.tileLayer(`${esri}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, {
        maxZoom: 16,
        attribution: "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors",
      }).addTo(m);
      Lf.tileLayer(`${esri}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 16, opacity: 0.3 }).addTo(m);
      const bounds = Lf.latLngBounds(city.nodes.map((n) => [n.lat, n.lng] as [number, number]));
      let fitted = false;
      const fit = () => {
        m.invalidateSize();
        if (!fitted && el.current && el.current.clientHeight > 150) {
          m.fitBounds(bounds, { padding: [48, 48] });
          fitted = true;
        }
      };
      m.on("click", () => selectRef.current(null));

      const byId = new Map(city.nodes.map((n) => [n.id, n]));
      lines.current = city.edges.map((edge) => {
        const a = byId.get(edge.from)!;
        const b = byId.get(edge.to)!;
        const line = Lf.polyline(
          [
            [a.lat, a.lng],
            [b.lat, b.lng],
          ],
          { color: "#5a5953", weight: 1.5, opacity: 0.5, interactive: false },
        ).addTo(m);
        return { edge, line };
      });

      for (const node of city.nodes) {
        const size = nodeSize(node);
        const marker = Lf.marker([node.lat, node.lng], {
          icon: Lf.divIcon({ className: "", html: "", iconSize: [size, size] }),
          keyboard: true,
          title: node.name,
        }).addTo(m);
        marker.on("click", (e) => {
          Lf.DomEvent.stopPropagation(e);
          selectRef.current(node.id);
        });
        marker.bindTooltip("", { className: "node-tip", direction: "top", offset: [0, -size / 2 - 4] });
        markerMap.set(node.id, marker);
      }
      map.current = m;
      paint();
      // Keep tiles filling the box when the layout around the map changes.
      resize = new ResizeObserver(fit);
      resize.observe(el.current);
      fit();
    })();
    return () => {
      cancelled = true;
      resize?.disconnect();
      map.current?.remove();
      map.current = null;
      markerMap.clear();
      lines.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city]);

  function paint() {
    const Lf = lib.current;
    if (!Lf || !map.current) return;
    const { result, hour, alloc, selected } = latest.current;
    const h = Math.max(0, Math.min(Math.round(hour), result.nodes[city.nodes[0].id].byHour.length - 1));

    for (const node of city.nodes) {
      const marker = markers.current.get(node.id)!;
      const s = result.nodes[node.id];
      const p = s.byHour[h];
      const prev = s.byHour[Math.max(0, h - 2)];
      const hot = p - prev > 0.12 || (p > 0.5 && Math.abs(s.meanHour - h) < 1.5);
      const size = nodeSize(node);
      const badges = (Object.keys(alloc) as (keyof Allocation)[])
        .filter((t) => alloc[t].includes(node.id))
        .map((t) => `<span class="badge" title="${RESOURCE[t].label}">${RESOURCE[t].badge}</span>`)
        .join("");
      const ink = p > 0.55 ? "#1a0d06" : "#f0efec";
      marker.setIcon(
        Lf.divIcon({
          className: "",
          iconSize: [size, size],
          html: `<div class="node${hot ? " hot" : ""}${selected === node.id ? " selected" : ""}" style="background:${riskColor(p)};color:${ink}">${KIND_ICON[node.kind]}${badges ? `<div class="badges">${badges}</div>` : ""}</div>`,
        }),
      );
      marker.setZIndexOffset(selected === node.id ? 1000 : Math.round(p * 500));
      marker.setTooltipContent(
        `<div style="font-weight:600">${node.name}</div>` +
          `<div style="color:var(--ink-3)">${KIND_LABEL[node.kind]}</div>` +
          `<div style="margin-top:4px">P(fail by hour ${h}): <b>${pct(p)}</b></div>` +
          `<div>Expected harm: <b>${fmt(s.harm)}</b> people</div>` +
          (s.downstream > 1 ? `<div>Causes downstream: <b>${fmt(s.downstream)}</b></div>` : ""),
      );
    }

    for (const { edge, line } of lines.current) {
      const from = result.nodes[edge.from].byHour[h];
      const to = result.nodes[edge.to].byHour[h];
      // An edge "carries" the cascade when both ends have failed in many storms.
      const live = Math.min(from, to);
      const touchesSelected = selected !== null && (edge.from === selected || edge.to === selected);
      const color = live > 0.05 ? riskColor(0.35 + live * 0.65) : "#5a5953";
      line.setStyle({
        color: touchesSelected ? "#f0efec" : color,
        weight: touchesSelected ? 3 : 1.5 + live * 3,
        opacity: touchesSelected ? 0.95 : live > 0.05 ? 0.45 + live * 0.5 : 0.35,
        dashArray: live > 0.05 || touchesSelected ? undefined : "4 6",
      });
      const path = line.getElement() as SVGPathElement | undefined;
      path?.classList.toggle("edge-flow", live > 0.25 || touchesSelected);
    }
  }

  useEffect(() => {
    paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, hour, alloc, selected]);

  return <div ref={el} className="h-full w-full" aria-label={`Map of ${city.name} infrastructure and hazards`} />;
}
