import {
  ResearchImportSchema,
  VenueSchema,
} from "./domain.ts";
import type { CatalogueChange, ResearchRun } from "./domain.ts";
import { mergeVenue, resultForExistingRun, retrievalAllowsUpdate } from "./research-domain.ts";

const now = () => new Date().toISOString();
const json = <T>(value: string): T => JSON.parse(value) as T;
type RunRow = { run_id: string; started_at: string; completed_at: string; status: ResearchRun["status"]; summary: string };
type BoundStatement = D1PreparedStatement;

function parseRun(row: RunRow): ResearchRun {
  return { runId: row.run_id, startedAt: row.started_at, completedAt: row.completed_at, status: row.status, summary: json(row.summary) };
}

/** Build updates from a read snapshot, then commit run, venues, changes, and outcomes atomically. */
export async function importResearchWithDb(db: D1Database, input: unknown): Promise<{ run: ResearchRun; idempotent: boolean; accepted: number; changes: number }> {
  const parsed = ResearchImportSchema.parse(input);
  const existing = await db.prepare("SELECT run_id, started_at, completed_at, status, summary FROM research_runs WHERE run_id = ?")
    .bind(parsed.runId).first<RunRow>();
  const replay = resultForExistingRun(existing ? parseRun(existing) : null);
  if (replay) return replay;

  const startedAt = now();
  let accepted = 0;
  let changes = 0;
  let rejected = Math.max(0, parsed.outcomes.filter((outcome) => outcome.status === "success").length - parsed.venues.length);
  const loggedOutcomes = [...parsed.outcomes];
  const writes: BoundStatement[] = [];

  for (const inputVenue of parsed.venues) {
    try {
      const incoming = VenueSchema.parse(inputVenue);
      const retrieval = parsed.outcomes.find((outcome) => outcome.target === incoming.branchKey || outcome.target === incoming.id);
      if (!retrievalAllowsUpdate(retrieval?.status)) {
        rejected++;
        console.info("research venue retained prior evidence after non-success retrieval", incoming.branchKey, retrieval?.status);
        continue;
      }
      const previousRow = await db.prepare("SELECT payload FROM venues WHERE branch_key = ?").bind(incoming.branchKey).first<{ payload: string }>();
      const previous = previousRow ? VenueSchema.parse(json(previousRow.payload)) : null;
      const next = mergeVenue(previous, incoming);
      writes.push(db.prepare("INSERT INTO venues(id, branch_key, suburb, payload, updated_at) VALUES(?, ?, ?, ?, ?) ON CONFLICT(branch_key) DO UPDATE SET suburb=excluded.suburb, payload=excluded.payload, updated_at=excluded.updated_at")
        .bind(next.id, next.branchKey, next.suburb, JSON.stringify(next), now()));
      accepted++;
      if (JSON.stringify(previous) !== JSON.stringify(next)) {
        const change: CatalogueChange = { id: crypto.randomUUID(), runId: parsed.runId, venueId: next.id, changedAt: now(), kind: previous ? "catalogue-updated" : "venue-added", before: previous, after: next, reviewRequired: Boolean(previous) };
        writes.push(db.prepare("INSERT INTO catalogue_changes(id, run_id, venue_id, changed_at, kind, before_json, after_json, review_required) VALUES(?, ?, ?, ?, ?, ?, ?, ?)")
          .bind(change.id, change.runId, change.venueId, change.changedAt, change.kind, previous ? JSON.stringify(previous) : null, JSON.stringify(next), change.reviewRequired ? 1 : 0));
        changes++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      console.error("research venue import rejected", branchKey(inputVenue), message);
      rejected++;
      loggedOutcomes.push({ target: branchKey(inputVenue), status: "failed", message });
    }
  }

  // Derive the persisted counters only after item-level planning failures have been added.
  const failures = loggedOutcomes.filter((outcome) => outcome.status === "failed").length;
  const ambiguous = loggedOutcomes.filter((outcome) => outcome.status === "ambiguous").length;
  const completedAt = now();
  const summary = { accepted, rejected, failures, ambiguous };
  const status: ResearchRun["status"] = failures + ambiguous + rejected ? (accepted ? "partial" : "failed") : "complete";
  const run: ResearchRun = { runId: parsed.runId, startedAt, completedAt, status, summary };
  const transaction: BoundStatement[] = [
    db.prepare("INSERT INTO research_runs(run_id, started_at, completed_at, status, summary) VALUES(?, ?, ?, ?, ?)")
      .bind(run.runId, startedAt, completedAt, status, JSON.stringify(summary)),
    ...writes,
    ...loggedOutcomes.map((outcome) => db.prepare("INSERT INTO research_outcomes(id, run_id, target, status, message, source_url, logged_at) VALUES(?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), parsed.runId, outcome.target, outcome.status, outcome.message ?? null, outcome.sourceUrl ?? null, completedAt)),
  ];
  try {
    await db.batch(transaction);
  } catch (error) {
    // Concurrent callers can both plan against an absent run. The unique run insert fails
    // one transaction and D1 rolls back that entire batch; return the winner's stored result.
    try {
      const winner = await db.prepare("SELECT run_id, started_at, completed_at, status, summary FROM research_runs WHERE run_id = ?")
        .bind(parsed.runId).first<RunRow>();
      const duplicate = resultForExistingRun(winner ? parseRun(winner) : null);
      if (duplicate) return duplicate;
    } catch {
      // Preserve the original batch failure if the follow-up read also fails.
    }
    throw error;
  }
  return { run, idempotent: false, accepted, changes };
}

function branchKey(value: unknown) {
  return value && typeof value === "object" && "branchKey" in value ? String((value as { branchKey: unknown }).branchKey) : "unknown";
}
