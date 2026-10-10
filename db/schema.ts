import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const venues = sqliteTable("venues", {
  id: text("id").primaryKey(),
  branchKey: text("branch_key").notNull().unique(),
  suburb: text("suburb").notNull(),
  payload: text("payload").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const preferences = sqliteTable("preferences", {
  venueId: text("venue_id").primaryKey(),
  status: text("status").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const visits = sqliteTable("visits", {
  id: text("id").primaryKey(),
  visitedAt: text("visited_at").notNull(),
  payload: text("payload").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const researchRuns = sqliteTable("research_runs", {
  runId: text("run_id").primaryKey(),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at").notNull(),
  status: text("status").notNull(),
  summary: text("summary").notNull(),
});

export const researchOutcomes = sqliteTable("research_outcomes", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  target: text("target").notNull(),
  status: text("status").notNull(),
  message: text("message"),
  sourceUrl: text("source_url"),
  loggedAt: text("logged_at").notNull(),
});

export const catalogueChanges = sqliteTable("catalogue_changes", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  venueId: text("venue_id").notNull(),
  changedAt: text("changed_at").notNull(),
  kind: text("kind").notNull(),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  reviewRequired: integer("review_required", { mode: "boolean" }).notNull(),
});
