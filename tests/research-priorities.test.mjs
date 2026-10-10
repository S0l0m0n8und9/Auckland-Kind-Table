import test from "node:test";
import assert from "node:assert/strict";
import { buildResearchPriorities } from "../lib/research-domain.ts";

test("research priorities expose only derived favourite and want-to-try venue IDs", () => {
  const result = buildResearchPriorities(
    [{ id: "fave", lastCheckedAt: "2026-08-01" }, { id: "try", lastCheckedAt: "2026-10-01" }, { id: "visited", lastCheckedAt: "2026-01-01" }],
    [{ venue_id: "fave", status: "favourite" }, { venue_id: "try", status: "want-to-try" }, { venue_id: "visited", status: "visited" }],
  );
  assert.deepEqual(result, { favouriteVenueIds: ["fave"], wantToTryVenueIds: ["try"] });
  assert.equal(JSON.stringify(result).includes("visited"), false);
  assert.equal(JSON.stringify(result).includes("status"), false);
});
