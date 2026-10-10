# Auckland Kind Table recurring research instructions

Fresh researchers should retrieve these same instructions from `GET /api/research/instructions` and the current venue catalogue from `GET /api/research/catalogue` at the start of each run. The hosted route is the source of truth; the file `lib/research-instructions.ts` contains the self-contained instructions served there.

The research response includes the venue catalogue and `recheckPriorities.favouriteVenueIds` / `wantToTryVenueIds`. Those arrays contain venue IDs only. The service does not expose visits, diary details, photos, usernames, or raw preference records to the research workflow.

Each weekly run uses a unique `runId`, discovers at most 8 candidates, and rechecks at most 12 existing venues. Prioritize explicit catalogue change reports, then favourite and want-to-try IDs with `lastCheckedAt` older than 30 days, then other catalogue venues older than 90 days. Recheck the oldest records first. Do not treat diary activity as a research signal. Fewer than 12 rechecks is appropriate when no record meets the rules.

## Exact payload schema

The import envelope is `{ "runId": "unique-run-id", "venues": [], "outcomes": [] }`. A routine run contains no more than 20 venues (8 discoveries plus 12 rechecks); the one-time seed supports up to 60.

A venue has required properties `id`, `branchKey`, `name`, `type`, `address`, `suburb`, `latitude`, `longitude`, `dishes`, and `highChair`. `type` is `cafe`, `pub`, `gastropub`, or `restaurant`. Coordinates are numbers or `null`. Optional venue properties are `officialUrl`, `brand`, `highChairEvidence`, `mealNotes`, `familyNotes`, and `lastCheckedAt`. `brand` has the shape `{"id":"stable-lowercase-id","name":"Brand name"}`.

Only set `brand` when a multi-location relationship is confirmed. Reuse a known brand ID. Similar names alone are insufficient, and lookalike venues must not be grouped. Brand links only support browsing; never inherit dishes, dietary claims, high-chair status, visit reports, family notes, or other evidence between branches. Each branch keeps its own identity and evidence.

A dish has `id`, `name`, `vegan`, `glutenFree`, and `evidence`; optional fields are `price` and `notes`. Evidence has `url`, `excerpt`, `checkedAt` (`YYYY-MM-DD`), and `status`. Allowed evidence statuses are `menu-supported`, `venue-confirmed`, `visit-reported`, and `needs-checking`.

When rechecking, reuse the exact dish ID for the same named preparation and modification. Keep differently modified preparations separate. New IDs should be stable kebab-case values; do not replace an existing ID just to rename a dish.

High-chair status is `available`, `unavailable`, or `unknown`. Known statuses require a dated evidence source. `mealNotes` must name substantive main-meal options; put other family context in `familyNotes`.

An outcome has `target` (exact branch key or venue ID) and `status` (`success`, `failed`, `ambiguous`, or `unchanged`), with optional `message` and `sourceUrl`. Failed or ambiguous matching outcomes prevent a venue update and preserve earlier evidence.

## Example

```json
{
  "runId": "2026-10-weekly-auckland-001",
  "venues": [
    {
      "id": "example-cafe-ponsonby",
      "branchKey": "example-cafe-ponsonby",
      "name": "Example Cafe",
      "type": "cafe",
      "address": "10 Example Road",
      "suburb": "Ponsonby",
      "latitude": null,
      "longitude": null,
      "officialUrl": "https://example.org/",
      "dishes": [
        {
          "id": "vegetable-bowl",
          "name": "Vegetable Bowl",
          "vegan": true,
          "glutenFree": true,
          "evidence": [
            {
              "url": "https://example.org/menu",
              "excerpt": "Vegetable Bowl is labelled vegan and gluten free.",
              "checkedAt": "2026-10-09",
              "status": "menu-supported"
            }
          ]
        }
      ],
      "highChair": "unknown",
      "lastCheckedAt": "2026-10-09"
    }
  ],
  "outcomes": [
    { "target": "example-cafe-ponsonby", "status": "success" }
  ]
}
```

Use the source evidence actually retrieved. Do not infer gluten-free status from ingredients, coeliac safety from a menu label, a high chair from child-friendly facilities, or a main meal from a snack. Do not contact venues. Import through `POST /api/research/import` with the private Sites service authorization, then read back `GET /api/research/catalogue` and confirm accepted IDs. Reusing the same `runId` is idempotent. Never access diary or personal preference records; only use the safe venue ID priority arrays supplied by the catalogue route.
