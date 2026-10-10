import test from "node:test";
import assert from "node:assert/strict";
import { VenueSchema } from "../lib/domain.ts";
import { enrichVenueBrands, relatedVenues } from "../lib/related-brands.ts";
import { DEFAULT_FILTERS, filterVenues } from "../lib/catalogue-filters.ts";
import type { Catalogue, Venue } from "../lib/domain.ts";

const venue = (id: string, name = id, brand?: Venue["brand"]): Venue => VenueSchema.parse({
  id, branchKey: id, name, type: "restaurant", address: "1 Road", suburb: "CBD", latitude: null, longitude: null, dishes: [], ...(brand ? { brand } : {}),
});
const catalogue = (venues: Venue[]): Catalogue => ({ venues, preferences: {}, visits: [], runs: [], changes: [] });

test("legacy curated branch IDs resolve to five &Sushi and four Khu Khu locations", () => {
  const ids = ["andsushi-city-works-depot", "andsushi-eastridge", "andsushi-carlton-gore", "andsushi-newmarket", "andsushi-smales-farm", "khu-khu-cbd", "khu-khu-milford", "khu-khu-parnell", "khu-khu-ponsonby"];
  const enriched = enrichVenueBrands(ids.map((id) => venue(id)));
  assert.equal(enriched.filter((item) => item.brand?.id === "andsushi").length, 5);
  assert.equal(enriched.filter((item) => item.brand?.id === "khu-khu").length, 4);
});

test("explicit metadata supports differently named branches and overrides legacy curation", () => {
  const [custom, override] = enrichVenueBrands([
    venue("new-branch", "Little Lantern", { id: "lantern-group", name: "Lantern Group" }),
    venue("andsushi-eastridge", "East Ridge Sushi", { id: "custom-id", name: "Custom Label" }),
  ]);
  assert.deepEqual(relatedVenues(custom!, [custom!, venue("partner-branch", "Lantern at the Wharf", { id: "lantern-group", name: "Lantern Group" })]).map((item) => item.id), ["partner-branch"]);
  assert.deepEqual(override?.brand, { id: "custom-id", name: "Custom Label" });
});

test("name-only collisions remain ungrouped", () => {
  const first = venue("one", "Khun Pun");
  const second = venue("two", "Khun Pun");
  assert.deepEqual(relatedVenues(first, [first, second]), []);
});

test("legacy mapping matches only own exact curated keys", () => {
  const specialKey = venue("constructor", "Constructor Cafe");
  assert.equal(enrichVenueBrands([specialKey])[0]?.brand, undefined);
});

test("brand search accepts the three precise &Sushi spellings", () => {
  const venues = enrichVenueBrands(["andsushi-city-works-depot", "andsushi-eastridge", "khu-khu-cbd"].map((id) => venue(id)));
  for (const query of ["&Sushi", "andsushi", "and sushi"]) {
    assert.deepEqual(filterVenues(catalogue(venues), { ...DEFAULT_FILTERS, query }, null).map((item) => item.id).sort(), ["andsushi-city-works-depot", "andsushi-eastridge"]);
  }
  assert.deepEqual(filterVenues(catalogue(venues), { ...DEFAULT_FILTERS, query: "khunsushi" }, null), []);
});

test("branch filters still inspect that branch's own records", () => {
  const [hasDish, emptyBranch] = enrichVenueBrands([
    VenueSchema.parse({ ...venue("andsushi-city-works-depot"), dishes: [{ id: "bowl", name: "Bowl", vegan: true, glutenFree: true, evidence: [{ url: "https://example.org", excerpt: "Listed vegan and gluten free", checkedAt: "2026-10-01", status: "menu-supported" }] }], suburb: "CBD" }),
    VenueSchema.parse({ ...venue("andsushi-eastridge", "&Sushi Eastridge"), suburb: "Eastridge" }),
  ]);
  assert.deepEqual(filterVenues(catalogue([hasDish!, emptyBranch!]), { ...DEFAULT_FILTERS, diet: "vegan-gf" }, null).map((item) => item.id), ["andsushi-city-works-depot"]);
  assert.deepEqual(filterVenues(catalogue([hasDish!, emptyBranch!]), { ...DEFAULT_FILTERS, suburb: "CBD" }, null).map((item) => item.id), ["andsushi-city-works-depot"]);
  const chairAvailability = [hasDish!, { ...emptyBranch!, highChair: "available" as const }];
  assert.deepEqual(filterVenues(catalogue(chairAvailability), { ...DEFAULT_FILTERS, highChair: "available" }, null).map((item) => item.id), ["andsushi-eastridge"]);
});
