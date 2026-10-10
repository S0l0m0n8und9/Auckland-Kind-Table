import type { Venue } from "./domain.ts";

export type Brand = NonNullable<Venue["brand"]>;

// Exact, manually verified legacy branch IDs only. Explicit record metadata wins.
const LEGACY_BRANCH_BRANDS: Record<string, Brand> = {
  "andsushi-city-works-depot": { id: "andsushi", name: "&Sushi" },
  "andsushi-eastridge": { id: "andsushi", name: "&Sushi" },
  "andsushi-carlton-gore": { id: "andsushi", name: "&Sushi" },
  "andsushi-newmarket": { id: "andsushi", name: "&Sushi" },
  "andsushi-smales-farm": { id: "andsushi", name: "&Sushi" },
  "khu-khu-cbd": { id: "khu-khu", name: "Khu Khu" },
  "khu-khu-milford": { id: "khu-khu", name: "Khu Khu" },
  "khu-khu-parnell": { id: "khu-khu", name: "Khu Khu" },
  "khu-khu-ponsonby": { id: "khu-khu", name: "Khu Khu" },
};

export function resolveVenueBrand(venue: Venue): Venue {
  if (venue.brand || !Object.hasOwn(LEGACY_BRANCH_BRANDS, venue.id)) return venue;
  return { ...venue, brand: LEGACY_BRANCH_BRANDS[venue.id] };
}

export function enrichVenueBrands(venues: Venue[]): Venue[] {
  return venues.map(resolveVenueBrand);
}

export function relatedVenues(venue: Venue, venues: Venue[]): Venue[] {
  if (!venue.brand) return [];
  return venues.filter((candidate) => candidate.id !== venue.id && candidate.brand?.id === venue.brand?.id)
    .sort((left, right) => left.suburb.localeCompare(right.suburb) || left.name.localeCompare(right.name));
}

/** Recognize only explicit brand spellings and the three exact &Sushi search forms. */
export function brandQueryMatches(query: string, brandName: string): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return false;
  if (brandName === "&Sushi" && ["&sushi", "andsushi", "and sushi"].includes(normalized)) return true;
  return brandName.toLocaleLowerCase().includes(normalized);
}
