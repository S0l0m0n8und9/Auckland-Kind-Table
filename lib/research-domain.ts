import type { ResearchRun, Venue } from "./domain";

export function mergeVenue(previous: Venue | null, incoming: Venue): Venue {
  if (!previous) return incoming;
  const dishes = new Map(previous.dishes.map((dish) => [dish.id, dish]));
  for (const next of incoming.dishes) {
    const old = dishes.get(next.id);
    dishes.set(next.id, old ? { ...old, ...next, evidence: next.evidence.length ? next.evidence : old.evidence } : next);
  }
  return {
    ...previous,
    ...incoming,
    id: previous.id,
    dishes: [...dishes.values()],
    highChairEvidence: incoming.highChairEvidence ?? previous.highChairEvidence,
    highChair: incoming.highChair === "unknown" && !incoming.highChairEvidence ? previous.highChair : incoming.highChair,
    brand: incoming.brand ?? previous.brand,
    officialUrl: incoming.officialUrl ?? previous.officialUrl,
    lastCheckedAt: incoming.lastCheckedAt ?? previous.lastCheckedAt,
  };
}

export function resultForExistingRun(existing: ResearchRun | null) {
  return existing ? { run: existing, idempotent: true as const, accepted: 0, changes: 0 } : null;
}

export function retrievalAllowsUpdate(status: string | undefined): boolean {
  return status !== "failed" && status !== "ambiguous";
}

/** Return only safe venue identifiers derived from favourite/want-to-try state. */
export function buildResearchPriorities(
  venues: Array<{ id: string; lastCheckedAt?: string }>,
  preferenceRows: Array<{ venue_id: string; status: string }>,
) {
  const venueIds = new Set(venues.map((venue) => venue.id));
  const favouriteVenueIds: string[] = [];
  const wantToTryVenueIds: string[] = [];
  for (const row of preferenceRows) {
    if (!venueIds.has(row.venue_id)) continue;
    if (row.status === "favourite") favouriteVenueIds.push(row.venue_id);
    if (row.status === "want-to-try") wantToTryVenueIds.push(row.venue_id);
  }
  return {
    favouriteVenueIds: [...new Set(favouriteVenueIds)].sort(),
    wantToTryVenueIds: [...new Set(wantToTryVenueIds)].sort(),
  };
}
