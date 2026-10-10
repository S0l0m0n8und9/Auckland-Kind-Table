import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { convertResearchSources } from "../lib/catalogue-seed.ts";

const read = (file) => JSON.parse(readFileSync(new URL(`../data/research-source/${file}`, import.meta.url), "utf8"));
const convert = () => convertResearchSources(read("venues.json"), read("pub-venues.json"), read("locations.json"));

test("converts research to 51 exact-schema branches with conservative duplicate merging", () => {
  const venues = convert();
  assert.equal(venues.length, 51);
  assert.equal(new Set(venues.map((venue) => venue.id)).size, 51);
  const riverhead = venues.find((venue) => venue.id === "portage-bar-riverhead");
  assert.deepEqual(riverhead.dishes.map((dish) => dish.name).sort(), ["Green Salad", "Pan-Fried Dumplings"].sort());
  assert.equal(riverhead.dishes.find((dish) => dish.name === "Green Salad").glutenFree, true);
  assert.equal(riverhead.dishes.find((dish) => dish.name === "Pan-Fried Dumplings").glutenFree, false);
  assert.ok(riverhead.dishes.find((dish) => dish.name === "Pan-Fried Dumplings").evidence.length >= 2);
});

test("retains review candidates and sources while omitting low-confidence or out-of-Auckland pins", () => {
  const venues = convert();
  const gojo = venues.find((venue) => venue.id === "gojo-new-lynn");
  assert.equal(gojo.dishes[0].evidence[0].status, "needs-checking");
  assert.match(gojo.dishes[0].evidence[0].url, /^https:/);
  const lowConfidence = venues.find((venue) => venue.id === "mondays-wholefoods");
  assert.equal(lowConfidence.latitude, null);
  assert.equal(lowConfidence.longitude, null);
  assert.ok(venues.every((venue) => venue.latitude === null || (venue.latitude >= -37.1 && venue.latitude <= -36.2)));
  assert.ok(venues.every((venue) => venue.longitude === null || (venue.longitude >= 174.4 && venue.longitude <= 175.3)));
});

test("only main-meal dish evidence populates mealNotes and known high chairs have dated sources", () => {
  const venues = convert();
  const cafe = venues.find((venue) => venue.id === "postal-service-grey-lynn");
  assert.equal(cafe.highChair, "available");
  assert.equal(cafe.highChairEvidence.checkedAt, "2026-10-09");
  assert.ok(venues.every((venue) => venue.highChair !== "available" && venue.highChair !== "unavailable" || venue.highChairEvidence?.checkedAt));
  const salad = venues.find((venue) => venue.id === "matakana-village-pub");
  assert.equal(salad.mealNotes, undefined);
  const curry = venues.find((venue) => venue.id === "khu-khu-ponsonby");
  assert.match(curry.mealNotes, /Beef Up Massaman Curry/);
});

test("rejects malformed research sources and malformed Auckland location metadata", () => {
  const source = read("venues.json");
  assert.throws(() => convertResearchSources([{ ...source[0], id: "" }, ...source.slice(1)], read("pub-venues.json"), read("locations.json")));
  const locations = read("locations.json");
  assert.throws(() => convertResearchSources(source, read("pub-venues.json"), { ...locations, "east-auckland": { ...locations["east-auckland"], lat: -10 } }));
});

test("dish variants with different modifications never combine vegan and GF claims", () => {
  const venue = {
    id: "variant-cafe", name: "Variant Cafe", address: "1 Example Road", suburb: "Ponsonby", types: ["cafe"], lat: null, lng: null,
    highChairs: "unknown", dishes: [
      { name: "Tofu bowl", vegan: true, glutenFree: false, modifications: "with standard soy sauce", evidenceUrl: "https://example.org/menu", excerpt: "Tofu bowl labelled vegan.", checkedAt: "2026-10-09", status: "menu-supported" },
      { name: "Tofu bowl", vegan: false, glutenFree: true, modifications: "with gluten-free tamari", evidenceUrl: "https://example.org/gf-menu", excerpt: "Tofu bowl available with GF tamari.", checkedAt: "2026-10-09", status: "menu-supported" },
    ],
  };
  const otherSource = { ...venue, dishes: [venue.dishes[1]] };
  const [converted] = convertResearchSources([{ ...venue, dishes: [venue.dishes[0]] }], [otherSource], {});
  assert.equal(converted.dishes.length, 2);
  assert.equal(converted.dishes.some((dish) => dish.vegan && dish.glutenFree), false);
  assert.equal(new Set(converted.dishes.map((dish) => dish.id)).size, 2);
});

test("separate evidence records cannot compose one vegan-and-GF claim", () => {
  const venue = {
    id: "evidence-cafe", name: "Evidence Cafe", address: "2 Example Road", suburb: "Ponsonby", types: ["cafe"], lat: null, lng: null,
    highChairs: "unknown", dishes: [
      { name: "Tofu bowl", vegan: true, glutenFree: false, modifications: null, evidenceUrl: "https://example.org/vegan", excerpt: "Tofu bowl marked vegan.", checkedAt: "2026-10-09", status: "menu-supported" },
      { name: "Tofu bowl", vegan: false, glutenFree: true, modifications: null, evidenceUrl: "https://example.org/gf", excerpt: "Tofu bowl marked gluten-free.", checkedAt: "2026-10-09", status: "menu-supported" },
    ],
  };
  const [converted] = convertResearchSources([{ ...venue, dishes: [venue.dishes[0]] }], [{ ...venue, dishes: [venue.dishes[1]] }], {});
  assert.equal(converted.dishes.some((dish) => dish.vegan && dish.glutenFree), false);
});

test("dish IDs stay stable when source ordering changes", () => {
  const source = read("venues.json").find((venue) => venue.id === "east-auckland");
  const ids = (dishes) => convertResearchSources([{ ...source, dishes }], [], {}).flatMap((venue) => venue.dishes.map((dish) => dish.id)).sort();
  assert.deepEqual(ids(source.dishes), ids([...source.dishes].reverse()));
});

test("Mondays evidence is review-only while current availability and address conflict", async () => {
  const { isVeganAndGlutenFree } = await import("../lib/domain.ts");
  const venues = convertResearchSources(read("venues.json"), read("pub-venues.json"), read("locations.json"), readJson("../data/research-overrides.json"));
  const mondays = venues.find((venue) => venue.id === "mondays-wholefoods");
  assert.equal(mondays.dishes.length, 2);
  assert.ok(mondays.dishes.every((dish) => dish.evidence.every((item) => item.status === "needs-checking")));
  assert.ok(mondays.dishes.every((dish) => !isVeganAndGlutenFree(dish)));
  assert.match(mondays.familyNotes, /Operating status\/address needs checking; published menu and current listings conflict\./);
  assert.equal(mondays.latitude, null);
  assert.equal(mondays.longitude, null);
  assert.equal(mondays.lastCheckedAt, "2026-10-10");
});

function readJson(path) {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
}

test("Ragtime uses the corrected medium-confidence 467 New North Road point", () => {
  const seed = readJson("../data/initial-catalogue.json");
  const corrections = readJson("../data/research-source/location-corrections.json");
  const ragtime = seed.find((venue) => venue.id === "ragtime-kingsland");
  assert.equal(ragtime.address, "467 New North Road, Kingsland, Auckland");
  assert.equal(ragtime.latitude, corrections["ragtime-kingsland"].lat);
  assert.equal(ragtime.longitude, corrections["ragtime-kingsland"].lng);
});
