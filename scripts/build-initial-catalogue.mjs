import { readFileSync, writeFileSync } from "node:fs";
import { convertResearchSources } from "../lib/catalogue-seed.ts";

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const venues = convertResearchSources(
  readJson("../data/research-source/venues.json"),
  readJson("../data/research-source/pub-venues.json"),
  {
    ...readJson("../data/research-source/locations.json"),
    ...readJson("../data/research-source/location-corrections.json"),
  },
  readJson("../data/research-overrides.json"),
);
writeFileSync(new URL("../data/initial-catalogue.json", import.meta.url), `${JSON.stringify(venues, null, 2)}\n`);
console.log(`Built initial catalogue: ${venues.length} unique venues.`);
