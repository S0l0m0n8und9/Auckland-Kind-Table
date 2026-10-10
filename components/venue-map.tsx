"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Venue } from "@/lib/domain";

type MapApi = {
  map: (element: HTMLElement, options: object) => MapInstance;
  tileLayer: (url: string, options: object) => TileLayer;
  divIcon: (options: object) => unknown;
  marker: (point: [number, number], options: object) => Marker;
  layerGroup: () => { addTo(map: MapInstance): unknown; clearLayers(): void; addLayer(layer: Marker): void };
  latLngBounds: (points: [number, number][]) => { isValid(): boolean };
};
type TileLayer = { addTo(map: MapInstance): unknown; on(name: string, callback: () => void): TileLayer };
type MapInstance = {
  setView(point: [number, number], zoom: number): MapInstance;
  fitBounds(bounds: unknown, options?: object): MapInstance;
  remove(): void;
  invalidateSize(): void;
};
type Marker = { addTo(map: MapInstance): Marker; on(name: string, callback: () => void): Marker; bindTooltip(text: string | HTMLElement, options?: object): Marker };
declare global { interface Window { L?: MapApi } }

type Props = { venues: Venue[]; selectedId: string | null; onSelect: (id: string) => void };
let leafletPromise: Promise<MapApi> | null = null;
function loadLeaflet(): Promise<MapApi> {
  if (typeof window === "undefined") return Promise.reject(new Error("Map is only available in a browser"));
  if (window.L) return Promise.resolve(window.L);
  if (!leafletPromise) leafletPromise = new Promise((resolve, reject) => {
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"; document.head.appendChild(css);
    const script = document.createElement("script"); script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"; script.async = true;
    script.onload = () => window.L ? resolve(window.L) : reject(new Error("Map library did not start"));
    script.onerror = () => reject(new Error("Map tiles or map library could not be reached")); document.head.appendChild(script);
  });
  return leafletPromise;
}

export default function VenueMap({ venues, selectedId, onSelect }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<MapInstance | null>(null);
  const markers = useRef<ReturnType<MapApi["layerGroup"]> | null>(null);
  const [error, setError] = useState(false);
  const selectable = useMemo(() => venues.filter((venue) => venue.latitude !== null && venue.longitude !== null), [venues]);

  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((L) => {
      if (cancelled || !host.current || map.current) return;
      const instance = L.map(host.current, { zoomControl: true, scrollWheelZoom: false }).setView([-36.8485, 174.7633], 11);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).on("tileerror", () => setError(true)).addTo(instance);
      markers.current = L.layerGroup(); markers.current.addTo(instance);
      map.current = instance;
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; map.current?.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((L) => {
      if (cancelled || !map.current) return;
      const points: [number, number][] = [];
      markers.current?.clearLayers();
      for (const venue of selectable) {
        const point: [number, number] = [venue.latitude as number, venue.longitude as number]; points.push(point);
        const selected = venue.id === selectedId;
        const marker = L.marker(point, { icon: L.divIcon({ className: "kind-marker-wrap", html: `<span class="kind-marker${selected ? " kind-marker-selected" : ""}">${selected ? "✦" : "·"}</span>`, iconSize: [30, 38], iconAnchor: [15, 34] }) });
        const tooltip = document.createElement("span"); tooltip.textContent = venue.name;
        marker.bindTooltip(tooltip, { direction: "top", offset: [0, -24] }).on("click", () => onSelect(venue.id)); markers.current?.addLayer(marker);
      }
      if (selectedId) {
        const target = selectable.find((venue) => venue.id === selectedId);
        if (target) map.current?.setView([target.latitude as number, target.longitude as number], Math.max(14, 13));
        else if (points.length) map.current?.fitBounds(L.latLngBounds(points), { padding: [28, 28], maxZoom: 13 });
      } else if (points.length) map.current?.fitBounds(L.latLngBounds(points), { padding: [28, 28], maxZoom: 13 });
      else map.current?.setView([-36.8485, 174.7633], 11);
      window.setTimeout(() => map.current?.invalidateSize(), 80);
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [selectable, selectedId, onSelect]);

  return <div className="map-frame"><div ref={host} className="leaflet-host" aria-label="Map of Auckland dining venues" />
    {error && <div className="map-message"><strong>Map unavailable right now</strong><span>The list still works. Check your connection and try again.</span></div>}
    {!error && <div className="map-caption"><span>{selectable.length} mapped</span><span>© OpenStreetMap contributors</span></div>}
  </div>;
}
