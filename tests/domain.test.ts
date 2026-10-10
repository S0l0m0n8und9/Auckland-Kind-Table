import test from "node:test";
import assert from "node:assert/strict";
import { DishSchema, ResearchImportSchema, VenueSchema, isVeganAndGlutenFree, replaceVisit } from "../lib/domain.ts";
import { mergeVenue, resultForExistingRun, retrievalAllowsUpdate } from "../lib/research-domain.ts";

const evidence = { url: "https://example.org/menu", excerpt: "Roasted tofu bowl, vegan and gluten-free", checkedAt: "2026-10-01", status: "menu-supported" as const };
const dish = (overrides = {}) => DishSchema.parse({ id: "tofu-bowl", name: "Tofu bowl", evidence: [evidence], ...overrides });
const venue = (overrides = {}) => VenueSchema.parse({ id: "v1", branchKey: "cafe/ponsonby/1", name: "Kind Cafe", type: "cafe", address: "1 Example Rd", suburb: "Ponsonby", latitude: null, longitude: null, dishes: [dish()], ...overrides });

test("vegan + gluten-free classification requires both labels on one dish", () => {
  assert.equal(isVeganAndGlutenFree(dish({ vegan: true, glutenFree: true })), true);
  assert.equal(isVeganAndGlutenFree(dish({ vegan: true, glutenFree: false })), false);
  assert.equal(isVeganAndGlutenFree(dish({ vegan: false, glutenFree: true })), false);
  assert.equal(isVeganAndGlutenFree(dish({ vegan: true, glutenFree: true, evidence: [{ ...evidence, status: "needs-checking" }] })), false);
  assert.equal(isVeganAndGlutenFree(dish({ vegan: true, glutenFree: true, evidence: [] })), false);
});

test("high-chair defaults to unknown and coordinates may be honestly absent", () => {
  const parsed = venue();
  assert.equal(parsed.highChair, "unknown");
  assert.equal(parsed.latitude, null);
  assert.equal(venue({ highChair: "available" }).highChair, "available");
});

test("full visit replacement clears optional fields and keeps its venue identity", () => {
  const existing = { id: "visit-1", venueId: "v1", visitedAt: "2026-10-01", who: ["Ari"], dishes: ["Soup"], notes: "Keep this", rating: 5, wouldReturn: true, photoKey: "photo.jpg" };
  const replaced = replaceVisit(existing, { visitedAt: "2026-10-02", who: [], dishes: [], notes: "", modifications: "", price: "", highChair: "unknown", venueId: "attacker-venue", id: "attacker-id" });
  assert.equal(replaced.id, "visit-1");
  assert.equal(replaced.venueId, "v1");
  assert.equal(replaced.notes, "");
  assert.equal(replaced.rating, undefined);
  assert.equal(replaced.wouldReturn, undefined);
  assert.equal(replaced.photoKey, undefined);
  assert.deepEqual(replaced.dishes, []);
});

test("rejects impossible dates and non-HTTP source URLs", () => {
  assert.throws(() => VenueSchema.parse({ ...venue(), dishes: [dish({ evidence: [{ ...evidence, checkedAt: "2026-02-30" }] })] }));
  assert.throws(() => VenueSchema.parse({ ...venue(), dishes: [dish({ evidence: [{ ...evidence, url: "javascript:alert(1)" }] })] }));
});

test("brand metadata is optional and validates bounded stable IDs", () => {
  assert.equal(venue().brand, undefined);
  assert.deepEqual(venue({ brand: { id: "brand-name", name: "Brand Name" } }).brand, { id: "brand-name", name: "Brand Name" });
  assert.throws(() => venue({ brand: { id: "Brand Name", name: "Brand Name" } }));
  assert.throws(() => venue({ brand: { id: "brand-name", name: "" } }));
});

test("research imports cannot carry diary or preference mutations", () => {
  assert.throws(() => ResearchImportSchema.parse({ runId: "weekly-1", venues: [venue()], visits: [], preferences: {} }));
  assert.throws(() => ResearchImportSchema.parse({ runId: "weekly-1", venues: Array(61).fill(venue()) }));
});

test("empty follow-up evidence preserves existing catalogue claims", () => {
  const prior = venue({ highChair: "available", highChairEvidence: evidence });
  const update = venue({ dishes: [dish({ vegan: true, evidence: [] })], highChair: "unknown" });
  const merged = mergeVenue(prior, update);
  assert.equal(merged.highChair, "available");
  assert.deepEqual(merged.highChairEvidence, evidence);
  assert.deepEqual(merged.dishes[0]?.evidence, [evidence]);
});

test("merge preserves explicit brand metadata when a recheck omits it", () => {
  const prior = venue({ brand: { id: "known-brand", name: "Known Brand" } });
  const update = venue();
  assert.deepEqual(mergeVenue(prior, update).brand, { id: "known-brand", name: "Known Brand" });
});

test("failed and ambiguous retrievals cannot apply catalogue updates", () => {
  assert.equal(retrievalAllowsUpdate("failed"), false);
  assert.equal(retrievalAllowsUpdate("ambiguous"), false);
  assert.equal(retrievalAllowsUpdate("success"), true);
});

test("runId is retained as a stable retry key and diary data is outside the merge contract", () => {
  const first = ResearchImportSchema.parse({ runId: "weekly-2026-10-05", venues: [venue()], outcomes: [{ target: "kind-cafe", status: "failed" }] });
  const retry = ResearchImportSchema.parse({ ...first, venues: [venue({ name: "Different payload" })] });
  assert.equal(retry.runId, first.runId);
  const replay = resultForExistingRun({ runId: first.runId, startedAt: "2026-10-01T00:00:00Z", completedAt: "2026-10-01T00:01:00Z", status: "partial", summary: { accepted: 1, rejected: 0, failures: 1, ambiguous: 0 } });
  assert.equal(replay?.idempotent, true);
  assert.equal(replay?.accepted, 0);
  assert.equal(mergeVenue(null, first.venues[0]!).name, "Kind Cafe");
});
