import { z } from "zod";

export const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}, "Expected a real calendar date in YYYY-MM-DD format");
export const WebUrlSchema = z.string().url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "https:" || protocol === "http:";
}, "Only HTTP(S) URLs are supported");

export const EvidenceSchema = z.object({
  url: WebUrlSchema,
  excerpt: z.string().trim().min(1).max(500),
  checkedAt: IsoDateSchema,
  status: z.enum(["menu-supported", "venue-confirmed", "visit-reported", "needs-checking"]),
});
export const DishSchema = z.object({
  id: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(160),
  vegan: z.boolean().default(false),
  glutenFree: z.boolean().default(false),
  evidence: z.array(EvidenceSchema).max(12).default([]),
  price: z.string().max(80).optional(),
  notes: z.string().max(500).optional(),
});
export const BrandSchema = z.object({
  id: z.string().trim().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Expected a stable lowercase identifier"),
  name: z.string().trim().min(1).max(120),
}).strict();
export const VenueSchema = z.object({
  id: z.string().trim().min(1).max(120),
  branchKey: z.string().trim().min(1).max(180),
  name: z.string().trim().min(1).max(160),
  type: z.enum(["cafe", "pub", "gastropub", "restaurant"]),
  address: z.string().trim().min(1).max(300),
  suburb: z.string().trim().min(1).max(100),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  officialUrl: WebUrlSchema.optional(),
  brand: BrandSchema.optional(),
  dishes: z.array(DishSchema).max(80).default([]),
  highChair: z.enum(["available", "unavailable", "unknown"]).default("unknown"),
  highChairEvidence: EvidenceSchema.optional(),
  mealNotes: z.string().max(1000).optional(),
  familyNotes: z.string().max(1000).optional(),
  lastCheckedAt: IsoDateSchema.optional(),
}).strict();
export const VisitSchema = z.object({
  id: z.string().min(1).max(120).optional(),
  venueId: z.string().min(1).max(120),
  visitedAt: IsoDateSchema,
  who: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  dishes: z.array(z.string().trim().min(1).max(160)).max(40).default([]),
  modifications: z.string().max(1000).optional(),
  rating: z.number().int().min(1).max(5).optional(),
  notes: z.string().max(3000).optional(),
  wouldReturn: z.boolean().optional(),
  highChair: z.enum(["available", "unavailable", "unknown"]).optional(),
  price: z.string().max(80).optional(),
  photoKey: z.string().max(240).optional(),
}).strict();
export const PreferenceSchema = z.enum(["favourite", "want-to-try", "visited", "none"]);
export const ResearchOutcomeSchema = z.object({
  target: z.string().min(1).max(180),
  status: z.enum(["success", "failed", "ambiguous", "unchanged"]),
  message: z.string().max(1000).optional(),
  sourceUrl: WebUrlSchema.optional(),
}).strict();
export const ResearchImportSchema = z.object({
  runId: z.string().trim().min(1).max(160),
  // The regular workflow is limited to 20 (8 discoveries + 12 rechecks); a one-time seed may contain 60.
  venues: z.array(VenueSchema).max(60).default([]),
  outcomes: z.array(ResearchOutcomeSchema).max(100).default([]),
}).strict();

export type Evidence = z.infer<typeof EvidenceSchema>;
export type Dish = z.infer<typeof DishSchema>;
export type Venue = z.infer<typeof VenueSchema>;
export type Visit = z.infer<typeof VisitSchema>;
export type Preference = z.infer<typeof PreferenceSchema>;
export type ResearchRun = { runId: string; startedAt: string; completedAt: string; status: "complete" | "partial" | "failed"; summary: { accepted: number; rejected: number; failures: number; ambiguous: number } };
export type CatalogueChange = { id: string; runId: string; venueId: string; changedAt: string; kind: string; before: Venue | null; after: Venue | null; reviewRequired: boolean };
export type Catalogue = { venues: Venue[]; preferences: Record<string, Preference>; visits: Visit[]; runs: ResearchRun[]; changes: CatalogueChange[] };

export function isVeganAndGlutenFree(dish: Dish): boolean {
  return dish.vegan && dish.glutenFree && dish.evidence.some((item) => item.status !== "needs-checking");
}

export function validateVenue(input: unknown): Venue {
  return VenueSchema.parse(input);
}

export function replaceVisit(existing: Visit, input: unknown): Visit {
  return VisitSchema.parse({ ...(input as object), id: existing.id, venueId: existing.venueId });
}
