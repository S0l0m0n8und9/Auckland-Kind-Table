import { VenueSchema, type Evidence, type Venue } from "./domain.ts";
import { createHash } from "node:crypto";

type ResearchDish = {
  name: string;
  vegan: boolean;
  glutenFree: boolean;
  modifications?: string | null;
  evidenceUrl: string;
  excerpt: string;
  checkedAt: string;
  status: Evidence["status"];
};
type ResearchVenue = {
  id: string;
  name: string;
  address: string;
  suburb: string;
  types: string[];
  lat: number | null;
  lng: number | null;
  website?: string | null;
  menuUrl?: string | null;
  highChairs: "available" | "unavailable" | "unknown";
  highChairSource?: string | null;
  highChairCheckedAt?: string | null;
  dishes: ResearchDish[];
  notes?: string;
};
type Location = { lat: number; lng: number; source: string; confidence: "high" | "medium" | "low"; checkedAt: string };
type ResearchOverride = { venueId: string; dishEvidenceStatus?: Evidence["status"]; familyNote?: string; checkedAt?: string };
const AUCKLAND_BOUNDS = { minLat: -37.1, maxLat: -36.2, minLng: 174.4, maxLng: 175.3 };

function slug(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);
}
function checkedDate(value: string) {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  const date = match?.[1];
  if (!date || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error(`Invalid research check date: ${value}`);
  return date;
}
function isAuckland(lat: number, lng: number) {
  return lat >= AUCKLAND_BOUNDS.minLat && lat <= AUCKLAND_BOUNDS.maxLat && lng >= AUCKLAND_BOUNDS.minLng && lng <= AUCKLAND_BOUNDS.maxLng;
}
function chooseType(types: string[]): Venue["type"] {
  const type = ["gastropub", "pub", "cafe", "restaurant"].find((candidate) => types.includes(candidate));
  if (!type) throw new Error(`Unsupported venue type: ${types.join(", ")}`);
  return type as Venue["type"];
}
function evidence(url: string, excerpt: string, checkedAt: string, status: Evidence["status"]): Evidence {
  return { url, excerpt: excerpt.trim().slice(0, 500), checkedAt: checkedDate(checkedAt), status };
}
function isMainMeal(name: string) {
  return /\b(bowl|curry|fried rice|platter|burger|pizza|donburi|yakisoba|pad thai|stir fry|stroganoff|poke|nut roast|sandwich|hot dog|pie|kofta|tacos?)\b/i.test(name);
}

export function convertResearchSources(primaryInput: unknown, supplementalInput: unknown, locationInput: unknown, overridesInput: unknown = []): Venue[] {
  if (!Array.isArray(primaryInput) || !Array.isArray(supplementalInput) || !locationInput || typeof locationInput !== "object" || Array.isArray(locationInput)) throw new Error("Research sources must be venue arrays and a location object");
  if (!Array.isArray(overridesInput)) throw new Error("Research overrides must be an array");
  const sourceRows = [...primaryInput, ...supplementalInput] as ResearchVenue[];
  const locations = locationInput as Record<string, Location>;
  const merged = new Map<string, Venue>();

  for (const source of sourceRows) {
    if (!source || typeof source.id !== "string" || !source.id.trim() || !Array.isArray(source.dishes) || !Array.isArray(source.types)) throw new Error("Malformed venue research record");
    const location = locations[source.id];
    let latitude: number | null = null;
    let longitude: number | null = null;
    if (location) {
      if (![location.lat, location.lng].every(Number.isFinite) || !["high", "medium", "low"].includes(location.confidence) || typeof location.source !== "string" || !location.source.trim()) throw new Error(`Malformed location provenance for ${source.id}`);
      checkedDate(location.checkedAt);
      if (location.confidence !== "low") {
        if (!isAuckland(location.lat, location.lng)) throw new Error(`Location outside Auckland bounds for ${source.id}`);
        latitude = location.lat;
        longitude = location.lng;
      }
    }
    if (source.lat !== null && source.lat !== undefined && !Number.isFinite(source.lat)) throw new Error(`Malformed source latitude for ${source.id}`);
    if (source.lng !== null && source.lng !== undefined && !Number.isFinite(source.lng)) throw new Error(`Malformed source longitude for ${source.id}`);

    const knownChair = source.highChairs !== "unknown";
    if (knownChair && (!source.highChairSource || !source.highChairCheckedAt)) throw new Error(`Known high-chair status lacks dated evidence for ${source.id}`);
    const highChairEvidence = knownChair ? evidence(source.highChairSource!, `High-chair status reported by source for ${source.name}.`, source.highChairCheckedAt!, "needs-checking") : undefined;
    const dishes = source.dishes.map((item) => {
      if (!item.name?.trim() || typeof item.vegan !== "boolean" || typeof item.glutenFree !== "boolean") throw new Error(`Malformed dish for ${source.id}`);
      const modification = item.modifications?.trim().replace(/\s+/g, " ") ?? "";
      // Persist the same ID for the same named preparation across future rechecks.
      // The digest prevents collisions between different names/modifications after slugging.
      const dishKey = `${item.name.trim().toLocaleLowerCase()}\u0000${modification.toLocaleLowerCase()}\u0000vegan=${item.vegan}\u0000glutenFree=${item.glutenFree}`;
      const digest = createHash("sha256").update(dishKey).digest("hex").slice(0, 12);
      return {
        id: `${(slug(item.name) || "dish").slice(0, 100)}-${digest}`.slice(0, 120),
        name: item.name.trim(), vegan: item.vegan, glutenFree: item.glutenFree,
        evidence: [evidence(item.evidenceUrl, item.excerpt, item.checkedAt, item.status)],
        ...(modification ? { notes: modification.slice(0, 500) } : {}),
      };
    });
    const mainDishes = [...new Set(dishes.filter((dish) => isMainMeal(dish.name)).map((dish) => dish.name))];
    const venue = VenueSchema.parse({
      id: source.id,
      branchKey: source.id,
      name: source.name,
      type: chooseType(source.types),
      address: source.address,
      suburb: source.suburb,
      latitude,
      longitude,
      ...(source.website ? { officialUrl: source.website } : {}),
      dishes,
      highChair: source.highChairs,
      ...(highChairEvidence ? { highChairEvidence } : {}),
      ...(mainDishes.length ? { mealNotes: `Researched main-meal options include: ${mainDishes.join(", ")}.` } : {}),
      ...(source.notes?.trim() ? { familyNotes: source.notes.trim().slice(0, 1000) } : {}),
      lastCheckedAt: source.dishes.map((dish) => checkedDate(dish.checkedAt)).sort().at(-1) ?? (source.highChairCheckedAt ? checkedDate(source.highChairCheckedAt) : undefined),
    });

    const previous = merged.get(venue.id);
    if (!previous) {
      merged.set(venue.id, venue);
      continue;
    }
    const dishMap = new Map(previous.dishes.map((dish) => [dish.id, dish]));
    for (const next of venue.dishes) {
      const key = next.id;
      const old = dishMap.get(key);
      if (!old) { dishMap.set(key, next); continue; }
      old.vegan = old.vegan || next.vegan;
      old.glutenFree = old.glutenFree || next.glutenFree;
      old.evidence = [...old.evidence, ...next.evidence.filter((item) => !old.evidence.some((existing) => existing.url === item.url && existing.excerpt === item.excerpt))].slice(0, 12);
      old.notes = [old.notes, next.notes].filter(Boolean).join("; ").slice(0, 500) || undefined;
    }
    const chairConflict = previous.highChair !== "unknown" && venue.highChair !== "unknown" && previous.highChair !== venue.highChair;
    const evidenceItems = [...previous.dishes.flatMap((dish) => dish.evidence), ...venue.dishes.flatMap((dish) => dish.evidence)];
    const freshest = [...evidenceItems.map((item) => item.checkedAt), previous.highChairEvidence?.checkedAt, venue.highChairEvidence?.checkedAt].filter((value): value is string => Boolean(value)).sort().at(-1);
    const base = {
      ...previous,
      address: venue.address.length > previous.address.length ? venue.address : previous.address,
      latitude: previous.latitude ?? venue.latitude,
      longitude: previous.longitude ?? venue.longitude,
      officialUrl: previous.officialUrl ?? venue.officialUrl,
      dishes: [...dishMap.values()],
      highChair: chairConflict ? "unknown" as const : venue.highChair === "unknown" ? previous.highChair : venue.highChair,
      ...(chairConflict ? {} : { highChairEvidence: venue.highChairEvidence ?? previous.highChairEvidence }),
      ...(freshest ? { lastCheckedAt: freshest } : {}),
      familyNotes: [previous.familyNotes, venue.familyNotes].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index).join(" ").slice(0, 1000) || undefined,
    };
    merged.set(venue.id, VenueSchema.parse(base));
  }
  for (const rawOverride of overridesInput) {
    if (!rawOverride || typeof rawOverride !== "object" || !("venueId" in rawOverride) || typeof rawOverride.venueId !== "string") throw new Error("Malformed research override");
    const override = rawOverride as ResearchOverride;
    const venue = merged.get(override.venueId);
    if (!venue) throw new Error(`Research override references unknown venue ${override.venueId}`);
    if (override.dishEvidenceStatus) {
      venue.dishes = venue.dishes.map((dish) => ({
        ...dish,
        evidence: dish.evidence.map((item) => ({ ...item, status: override.dishEvidenceStatus! })),
      }));
    }
    if (override.familyNote?.trim()) venue.familyNotes = [venue.familyNotes, override.familyNote.trim()].filter(Boolean).join(" ").slice(0, 1000);
    if (override.checkedAt) venue.lastCheckedAt = checkedDate(override.checkedAt);
    merged.set(venue.id, VenueSchema.parse(venue));
  }
  return [...merged.values()].sort((a, b) => a.suburb.localeCompare(b.suburb) || a.name.localeCompare(b.name));
}
