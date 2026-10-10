import { isVeganAndGlutenFree, type Catalogue, type Evidence, type Venue } from "./domain.ts";
import { brandQueryMatches } from "./related-brands.ts";

export type Filters = {
  query: string;
  diet: "all" | "vegan" | "vegan-gf";
  type: string;
  suburb: string;
  highChair: "all" | "available" | "known";
  freshness: "all" | "fresh" | "stale";
  preference: "all" | "favourite" | "want-to-try" | "visited";
  distanceKm: number | null;
  mealSnack: "all" | "meal" | "snack";
};

export const DEFAULT_FILTERS: Filters = {
  query: "", diet: "all", type: "all", suburb: "all", highChair: "all",
  freshness: "all", preference: "all", distanceKm: null, mealSnack: "all",
};

export function isStale(date: string | undefined, now = new Date()): boolean {
  if (!date) return true;
  const checked = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(checked.valueOf()) || now.valueOf() - checked.valueOf() > 90 * 86400000;
}

export function evidenceNeedsReview(evidence: Evidence, now = new Date()): boolean {
  return evidence.status === "needs-checking" || isStale(evidence.checkedAt, now);
}

export function venueHasStaleEvidence(venue: Venue, now = new Date()): boolean {
  return isStale(venue.lastCheckedAt, now)
    || venue.dishes.some((dish) => dish.evidence.some((item) => evidenceNeedsReview(item, now)))
    || (venue.highChairEvidence ? evidenceNeedsReview(venue.highChairEvidence, now) : false);
}

export function distanceKm(from: { latitude: number; longitude: number }, venue: Venue): number | null {
  if (venue.latitude === null || venue.longitude === null) return null;
  const radians = (value: number) => value * Math.PI / 180;
  const dLat = radians(venue.latitude - from.latitude);
  const dLon = radians(venue.longitude - from.longitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(from.latitude)) * Math.cos(radians(venue.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function filterVenues(catalogue: Catalogue, filters: Filters, location: { latitude: number; longitude: number } | null, now = new Date()): Venue[] {
  const query = filters.query.trim().toLocaleLowerCase();
  return catalogue.venues.filter((venue) => {
    const dishes = venue.dishes;
    if (query && ![venue.name, venue.address, venue.suburb, venue.type, ...dishes.map((dish) => `${dish.name} ${dish.notes ?? ""}`)].join(" ").toLocaleLowerCase().includes(query) && !(venue.brand && brandQueryMatches(query, venue.brand.name))) return false;
    if (filters.type !== "all" && venue.type !== filters.type) return false;
    if (filters.suburb !== "all" && venue.suburb !== filters.suburb) return false;
    if (filters.highChair === "available" && venue.highChair !== "available") return false;
    if (filters.highChair === "known" && venue.highChair === "unknown") return false;
    const stale = venueHasStaleEvidence(venue, now);
    if (filters.freshness === "fresh" && stale) return false;
    if (filters.freshness === "stale" && !stale) return false;
    const preference = catalogue.preferences[venue.id] ?? "none";
    if (filters.preference === "visited" ? !catalogue.visits.some((visit) => visit.venueId === venue.id) : filters.preference !== "all" && preference !== filters.preference) return false;
    if (filters.diet === "vegan" && !dishes.some((dish) => dish.vegan && dish.evidence.some((item) => item.status !== "needs-checking"))) return false;
    if (filters.diet === "vegan-gf" && !dishes.some(isVeganAndGlutenFree)) return false;
    if (filters.mealSnack === "meal" && !venue.mealNotes?.trim()) return false;
    if (filters.mealSnack === "snack" && !dishes.some((dish) => /\b(snack|cake|cookie|biscuit|scone|muffin|pastry|slice|treat)\b/i.test(`${dish.name} ${dish.notes ?? ""}`))) return false;
    if (filters.distanceKm !== null && location) {
      const distance = distanceKm(location, venue);
      if (distance === null || distance > filters.distanceKm) return false;
    }
    return true;
  });
}
