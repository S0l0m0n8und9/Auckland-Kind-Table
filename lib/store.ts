import { env } from "cloudflare:workers";
import {
  Catalogue, Preference, PreferenceSchema, ResearchRun, Venue, VenueSchema, Visit, VisitSchema,
} from "./domain";
import { importResearchWithDb } from "./research-import";
import { buildResearchPriorities } from "./research-domain";
import { enrichVenueBrands } from "./related-brands";

type Db = D1Database;
function database(): Db {
  const db = (env as unknown as { DB?: Db }).DB;
  if (!db) throw new Error("Cloudflare D1 binding DB is unavailable");
  return db;
}
const now = () => new Date().toISOString();
const json = <T>(value: string): T => JSON.parse(value) as T;

export async function getCatalogue(): Promise<Catalogue> {
  const db = database();
  const [venueRows, preferenceRows, visitRows, runRows, changeRows] = await Promise.all([
    db.prepare("SELECT payload FROM venues ORDER BY suburb COLLATE NOCASE").all<{ payload: string }>(),
    db.prepare("SELECT venue_id, status FROM preferences").all<{ venue_id: string; status: Preference }>(),
    db.prepare("SELECT payload FROM visits ORDER BY visited_at DESC").all<{ payload: string }>(),
    db.prepare("SELECT run_id, started_at, completed_at, status, summary FROM research_runs ORDER BY completed_at DESC").all<{ run_id: string; started_at: string; completed_at: string; status: ResearchRun["status"]; summary: string }>(),
    db.prepare("SELECT id, run_id, venue_id, changed_at, kind, before_json, after_json, review_required FROM catalogue_changes ORDER BY changed_at DESC LIMIT 500").all<{ id: string; run_id: string; venue_id: string; changed_at: string; kind: string; before_json: string | null; after_json: string | null; review_required: number }>(),
  ]);
  return {
    venues: enrichVenueBrands(venueRows.results.map((r) => VenueSchema.parse(json(r.payload)))),
    preferences: Object.fromEntries(preferenceRows.results.map((r) => [r.venue_id, r.status])),
    visits: visitRows.results.map((r) => json<Visit>(r.payload)),
    runs: runRows.results.map((r) => ({ runId: r.run_id, startedAt: r.started_at, completedAt: r.completed_at, status: r.status, summary: json(r.summary) })),
    changes: changeRows.results.map((r) => ({ id: r.id, runId: r.run_id, venueId: r.venue_id, changedAt: r.changed_at, kind: r.kind, before: r.before_json ? json(r.before_json) : null, after: r.after_json ? json(r.after_json) : null, reviewRequired: Boolean(r.review_required) })),
  };
}

export async function saveVisit(input: unknown, id?: string): Promise<Visit> {
  const parsed = VisitSchema.parse({ ...(input as object), ...(id ? { id } : {}) });
  if (!(await getVenue(parsed.venueId))) throw new Error("Venue not found");
  const record = { ...parsed, id: parsed.id ?? crypto.randomUUID() } as Visit;
  const stamp = now();
  await database().prepare("INSERT INTO visits(id, visited_at, payload, created_at, updated_at) VALUES(?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET visited_at=excluded.visited_at, payload=excluded.payload, updated_at=excluded.updated_at")
    .bind(record.id, record.visitedAt, JSON.stringify(record), stamp, stamp).run();
  return record;
}

export async function deleteVisit(id: string): Promise<boolean> {
  const result = await database().prepare("DELETE FROM visits WHERE id = ?").bind(id).run();
  return (result.meta.changes ?? 0) > 0;
}

export async function savePreference(venueId: string, status: Preference): Promise<void> {
  PreferenceSchema.parse(status);
  if (!(await getVenue(venueId))) throw new Error("Venue not found");
  await database().prepare("INSERT INTO preferences(venue_id, status, updated_at) VALUES(?, ?, ?) ON CONFLICT(venue_id) DO UPDATE SET status=excluded.status, updated_at=excluded.updated_at")
    .bind(venueId, status, now()).run();
}

export async function exportData() {
  const catalogue = await getCatalogue();
  return { exportedAt: now(), ...catalogue };
}

export async function getResearchCatalogue() {
  const db = database();
  const [venueResult, preferenceResult] = await Promise.all([
    db.prepare("SELECT payload FROM venues ORDER BY suburb COLLATE NOCASE").all<{ payload: string }>(),
    db.prepare("SELECT venue_id, status FROM preferences WHERE status IN ('favourite', 'want-to-try')").all<{ venue_id: string; status: string }>(),
  ]);
  const venues = enrichVenueBrands(venueResult.results.map((row) => VenueSchema.parse(json(row.payload))));
  return {
    venues,
    recheckPriorities: buildResearchPriorities(venues, preferenceResult.results),
  };
}

/** Idempotent by runId. Failed/ambiguous targets are logged; they never erase catalogue evidence. */
export async function importResearch(input: unknown): Promise<{ run: ResearchRun; idempotent: boolean; accepted: number; changes: number }> {
  return importResearchWithDb(database(), input);
}

async function getVenue(id: string): Promise<Venue | null> {
  const row = await database().prepare("SELECT payload FROM venues WHERE id = ?").bind(id).first<{ payload: string }>();
  return row ? VenueSchema.parse(json(row.payload)) : null;
}
