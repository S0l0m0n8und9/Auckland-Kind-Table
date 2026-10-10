import test from "node:test";
import assert from "node:assert/strict";
import type { Catalogue, Dish, Venue } from "../lib/domain.ts";
import { DEFAULT_FILTERS, filterVenues, isStale } from "../lib/catalogue-filters.ts";

const evidence = (status: "menu-supported" | "needs-checking" = "menu-supported", checkedAt = "2026-10-01") => ({ url: "https://example.org/menu", excerpt: "Menu item listed", checkedAt, status });
const dish = (id: string, vegan: boolean, glutenFree: boolean, status: "menu-supported" | "needs-checking" = "menu-supported"): Dish => ({ id, name: id, vegan, glutenFree, evidence: [evidence(status)] });
const venue = (id: string, dishes: Dish[], highChair: Venue["highChair"] = "unknown"): Venue => ({ id, branchKey: id, name: id, type: "cafe", address: "1 Road", suburb: "Ponsonby", latitude: null, longitude: null, dishes, highChair, lastCheckedAt: "2026-10-01" });
const catalogue = (venues: Venue[]): Catalogue => ({ venues, preferences: {}, visits: [], runs: [], changes: [] });

test("vegan + GF requires both claims on the same supported dish", () => {
  const splitClaims = venue("split", [dish("vegan bowl", true, false), dish("GF toast", false, true)]);
  const paired = venue("paired", [dish("vegan GF bowl", true, true)]);
  const unverified = venue("unchecked", [dish("unchecked bowl", true, true, "needs-checking")]);
  const matches = filterVenues(catalogue([splitClaims, paired, unverified]), { ...DEFAULT_FILTERS, diet: "vegan-gf" }, null, new Date("2026-10-09T00:00:00Z"));
  assert.deepEqual(matches.map((item) => item.id), ["paired"]);
});

test("high-chair filters preserve unknown as its own state", () => {
  const list = catalogue([venue("yes", [], "available"), venue("no", [], "unavailable"), venue("unknown", [])]);
  assert.deepEqual(filterVenues(list, { ...DEFAULT_FILTERS, highChair: "available" }, null).map((item) => item.id), ["yes"]);
  assert.deepEqual(filterVenues(list, { ...DEFAULT_FILTERS, highChair: "known" }, null).map((item) => item.id), ["yes", "no"]);
});

test("high-chair source freshness participates in venue freshness filtering", () => {
  const oldChairSource = { ...venue("old-chair", [dish("meal", false, false)]), highChairEvidence: evidence("menu-supported", "2026-06-01") };
  const currentChairSource = { ...venue("current-chair", [dish("meal", false, false)]), highChairEvidence: evidence("menu-supported", "2026-10-01") };
  const list = catalogue([oldChairSource, currentChairSource]);
  const now = new Date("2026-10-09T00:00:00Z");
  assert.deepEqual(filterVenues(list, { ...DEFAULT_FILTERS, freshness: "fresh" }, null, now).map((item) => item.id), ["current-chair"]);
  assert.deepEqual(filterVenues(list, { ...DEFAULT_FILTERS, freshness: "stale" }, null, now).map((item) => item.id), ["old-chair"]);
});

test("missing or old dates are stale and unknown evidence stays reviewable", () => {
  assert.equal(isStale(undefined, new Date("2026-10-09T00:00:00Z")), true);
  assert.equal(isStale("2026-06-01", new Date("2026-10-09T00:00:00Z")), true);
  assert.equal(isStale("2026-10-01", new Date("2026-10-09T00:00:00Z")), false);
});

test("meal and snack filters use explicit meal notes or a listed snack item", () => {
  const meal = { ...venue("meal", []), mealNotes: "Lunch bowls and dinner plates" };
  const snack = venue("snack", [{ ...dish("scone", true, false), notes: "Baked snack" }]);
  const unknown = venue("unknown", [dish("tofu bowl", true, false)]);
  const list = catalogue([meal, snack, unknown]);
  assert.deepEqual(filterVenues(list, { ...DEFAULT_FILTERS, mealSnack: "meal" }, null).map((item) => item.id), ["meal"]);
  assert.deepEqual(filterVenues(list, { ...DEFAULT_FILTERS, mealSnack: "snack" }, null).map((item) => item.id), ["snack"]);
});
