import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const originFrom = (value) => {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("siteUrl must be an HTTPS origin without path, query, or credentials");
  return url.origin;
};

async function readRequest() {
  if (process.stdin.isTTY) {
    process.stdout.write("Paste the seed request JSON (input hidden), then press Enter: ");
    process.stdin.setRawMode(true);
    process.stdin.setEncoding("utf8");
    return new Promise((resolve, reject) => {
      let value = "";
      process.stdin.on("data", (chunk) => {
        for (const char of chunk) {
          if (char === "\u0003") { process.stdin.setRawMode(false); reject(new Error("Input cancelled")); return; }
          if (char === "\r" || char === "\n") {
            process.stdin.setRawMode(false);
            process.stdin.pause();
            process.stdout.write("\n");
            resolve(value);
            return;
          }
          if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
          else value += char;
        }
      });
    });
  }
  return readFileSync(0, "utf8");
}

async function request(origin, path, token, body) {
  const response = await fetch(new URL(path, origin), {
    method: body === undefined ? "GET" : "POST",
    redirect: "error",
    headers: { "OAI-Sites-Authorization": `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`Hosted service returned HTTP ${response.status} for ${path}`);
  try { return await response.json(); }
  catch { throw new Error(`Hosted service returned invalid JSON for ${path}`); }
}

async function main() {
  let input;
  try { input = JSON.parse(await readRequest()); }
  catch { throw new Error("Expected a JSON seed request on stdin"); }
  if (!input || typeof input !== "object" || typeof input.siteUrl !== "string" || typeof input.token !== "string" || !input.token.trim() || (input.runId !== undefined && typeof input.runId !== "string") || (input.verifyOnly !== undefined && typeof input.verifyOnly !== "boolean")) {
    throw new Error("Seed request must include siteUrl, token, and optional runId/verifyOnly");
  }
  const origin = originFrom(input.siteUrl);
  if (/[\r\n]/.test(input.token)) throw new Error("Token must be a single-line value");
  const token = input.token;
  const instructions = await request(origin, "/api/research/instructions", token);
  if (typeof instructions.instructions !== "string" || !instructions.instructions.trim()) throw new Error("Hosted research instructions are unavailable");
  const before = await request(origin, "/api/research/catalogue", token);
  if (!Array.isArray(before.venues)) throw new Error("Hosted research catalogue has an unexpected shape");
  if (input.verifyOnly) {
    process.stdout.write(`Verified private research routes; catalogue has ${before.venues.length} venues.\n`);
    return;
  }

  const venues = JSON.parse(readFileSync(new URL("../data/initial-catalogue.json", import.meta.url), "utf8"));
  if (!Array.isArray(venues) || venues.length > 60) throw new Error("Initial catalogue is invalid or exceeds the seed limit");
  const runId = input.runId?.trim() || `initial-seed-${randomUUID()}`;
  const payload = { runId, venues, outcomes: venues.map((venue) => ({ target: venue.branchKey, status: "success" })) };
  const first = await request(origin, "/api/research/import", token, payload);
  const replay = await request(origin, "/api/research/import", token, payload);
  if (replay.idempotent !== true || replay.accepted !== 0) throw new Error("Same-run replay did not return an idempotent result");
  const after = await request(origin, "/api/research/catalogue", token);
  if (!Array.isArray(after.venues)) throw new Error("Hosted research readback has an unexpected shape");
  const actualById = new Map(after.venues.map((venue) => [venue.id, venue]));
  const missing = venues.filter((venue) => {
    const actual = actualById.get(venue.id);
    return !actual || actual.branchKey !== venue.branchKey || actual.name !== venue.name || actual.dishes.length !== venue.dishes.length;
  }).length;
  if (missing) throw new Error(`Readback is missing or differs for ${missing} seeded venue records`);
  process.stdout.write(`Seed ${first.idempotent ? "replayed" : "applied"}; venues=${venues.length}; accepted=${first.accepted ?? 0}; replay=idempotent; mismatches=${missing}.\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Seed failed"}\n`);
  process.exitCode = 1;
});
