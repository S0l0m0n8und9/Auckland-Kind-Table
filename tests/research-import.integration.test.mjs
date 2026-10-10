import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { importResearchWithDb } from "../lib/research-import.ts";

class SqliteStatement {
  constructor(owner, sql, values = []) { this.owner = owner; this.sql = sql; this.values = values; }
  bind(...values) { return new SqliteStatement(this.owner, this.sql, values); }
  first() { return this.owner.sqlite.prepare(this.sql).get(...this.values) ?? null; }
  all() { return { results: this.owner.sqlite.prepare(this.sql).all(...this.values) }; }
  run() {
    const result = this.owner.sqlite.prepare(this.sql).run(...this.values);
    return { success: true, meta: { changes: Number(result.changes) } };
  }
}

class SqliteD1Fixture {
  constructor() {
    this.sqlite = new DatabaseSync(":memory:");
    const migration = readFileSync(new URL("../drizzle/0000_ambitious_zaran.sql", import.meta.url), "utf8");
    for (const statement of migration.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) this.sqlite.exec(statement);
  }
  prepare(sql) { return new SqliteStatement(this, sql); }
  async batch(statements) {
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((statement) => statement.run());
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }
}

const source = { url: "https://example.org/menu", excerpt: "Tofu bowl (vegan, gluten-free)", checkedAt: "2026-10-09", status: "menu-supported" };
function venue(name = "Kind Cafe") {
  return {
    id: "venue-1", branchKey: "kind-cafe:ponsonby", name, type: "cafe", address: "1 Example Road", suburb: "Ponsonby",
    latitude: null, longitude: null, highChair: "unknown",
    dishes: [{ id: "tofu-bowl", name: "Tofu bowl", vegan: true, glutenFree: true, evidence: [source] }],
  };
}
const payload = (runId, name = "Kind Cafe") => ({ runId, venues: [venue(name)], outcomes: [{ target: "kind-cafe:ponsonby", status: "success" }] });

test("research import is atomic and same-run replay preserves diary and preferences", async () => {
  const db = new SqliteD1Fixture();
  db.sqlite.prepare("INSERT INTO visits(id, visited_at, payload, created_at, updated_at) VALUES(?, ?, ?, ?, ?)").run("visit-1", "2026-10-08", JSON.stringify({ id: "visit-1", notes: "Family dinner" }), "created", "updated");
  db.sqlite.prepare("INSERT INTO preferences(venue_id, status, updated_at) VALUES(?, ?, ?)").run("venue-1", "favourite", "created");

  const first = await importResearchWithDb(db, payload("run-once"));
  const replay = await importResearchWithDb(db, payload("run-once", "Must not replace first payload"));

  assert.equal(first.idempotent, false);
  assert.equal(first.run.summary.accepted, 1);
  assert.equal(replay.idempotent, true);
  assert.equal(replay.accepted, 0);
  assert.equal(db.sqlite.prepare("SELECT count(*) AS count FROM research_runs WHERE run_id = ?").get("run-once").count, 1);
  assert.equal(db.sqlite.prepare("SELECT count(*) AS count FROM catalogue_changes WHERE run_id = ?").get("run-once").count, 1);
  assert.equal(db.sqlite.prepare("SELECT count(*) AS count FROM research_outcomes WHERE run_id = ?").get("run-once").count, 1);
  assert.equal(JSON.parse(db.sqlite.prepare("SELECT payload FROM venues WHERE branch_key = ?").get("kind-cafe:ponsonby").payload).name, "Kind Cafe");
  assert.equal(db.sqlite.prepare("SELECT count(*) AS count FROM visits").get().count, 1);
  assert.equal(db.sqlite.prepare("SELECT status FROM preferences WHERE venue_id = ?").get("venue-1").status, "favourite");
});

test("concurrent duplicate runIds commit one venue update and one change record", async () => {
  const db = new SqliteD1Fixture();
  const [left, right] = await Promise.all([
    importResearchWithDb(db, payload("run-race", "First writer")),
    importResearchWithDb(db, payload("run-race", "Second writer")),
  ]);

  assert.equal([left, right].filter((result) => !result.idempotent).length, 1);
  assert.equal([left, right].filter((result) => result.idempotent).length, 1);
  assert.equal(db.sqlite.prepare("SELECT count(*) AS count FROM research_runs WHERE run_id = ?").get("run-race").count, 1);
  assert.equal(db.sqlite.prepare("SELECT count(*) AS count FROM catalogue_changes WHERE run_id = ?").get("run-race").count, 1);
});

test("runtime item rejection is persisted in the final failure counter", async () => {
  const db = new SqliteD1Fixture();
  db.sqlite.prepare("INSERT INTO venues(id, branch_key, suburb, payload, updated_at) VALUES(?, ?, ?, ?, ?)").run("venue-1", "kind-cafe:ponsonby", "Ponsonby", "{invalid json", "old");

  const result = await importResearchWithDb(db, payload("run-invalid-old-record"));

  assert.equal(result.run.summary.failures, 1);
  assert.equal(result.run.summary.rejected, 1);
  assert.equal(result.run.status, "failed");
  const outcome = db.sqlite.prepare("SELECT status, message FROM research_outcomes WHERE run_id = ? AND status = 'failed'").get("run-invalid-old-record");
  assert.equal(outcome.status, "failed");
  assert.match(outcome.message, /JSON|position|property/i);
});
