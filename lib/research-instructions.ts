export const researchInstructions = `Auckland Kind Table — recurring catalogue research

Purpose and privacy
Maintain only the private Auckland venue catalogue. At the start of every run, fetch GET /api/research/instructions and GET /api/research/catalogue from this same owner-private Site. Use the current response and these instructions; do not rely on prior conversation context. The catalogue response contains venue records and recheckPriorities with favouriteVenueIds and wantToTryVenueIds. These are venue identifiers only, derived by the service for research priority. Do not request, infer, disclose, or alter visits, diary notes, photos, usernames, or raw preference records. Do not contact venues, send invitations, publish data, or change schedules.

Run limits and priority
Use a unique stable runId for each run. Reusing a runId returns the original result without applying the payload again. Discover no more than 8 promising Auckland-region cafes, pubs, gastropubs, or restaurants and recheck no more than 12 existing venues per weekly run. Within the 12 rechecks, prioritize any catalogue evidence that was explicitly reported as changed through a research outcome; then favouriteVenueIds and wantToTryVenueIds whose lastCheckedAt is more than 30 days ago; then other catalogue venues whose lastCheckedAt is more than 90 days ago. When choosing an unprioritized venue, prefer the oldest lastCheckedAt. Do not treat a private diary visit as a change report. If nothing qualifies, send fewer rechecks.

Research rules
Resolve each location to one specific branch and preserve its branch identity. Do not invent dishes, addresses, coordinates, or dietary claims. Use null coordinates when they cannot be confidently matched to the branch. Record a dish only when its exact name and labels are supported by the cited evidence. A vegan-and-gluten-free match requires both labels on the same dish. Separate vegan and gluten-free dishes never combine into a match. A labelled gluten-free option does not establish coeliac safety or cross-contact safety.

Brand and branch relationships
Set the optional venue field brand only when the branch is confirmed to belong to a named multi-location brand. Use {"id":"stable-lowercase-id","name":"Brand name"}; reuse an existing brand id whenever that brand is already in the catalogue. A matching or similar venue name alone is not enough to establish a relationship. Do not infer a brand from lookalike names. Brand metadata groups branches for browsing only: never inherit dishes, dietary claims, high-chair status, visit reports, family notes, or other evidence between branches. Every branch keeps its own identity and evidence.

Every evidence item needs an HTTP(S) URL, a short factual excerpt, the actual date checked as YYYY-MM-DD, and one status: menu-supported, venue-confirmed, visit-reported, or needs-checking. Use venue-confirmed only for direct confirmation from the venue. Keep old, third-party, seasonal, uncertain, and unverified menu candidates as needs-checking. Do not convert third-party reports into visit-reported; that status is reserved for a user's own diary entry, which this workflow cannot access. If retrieval fails or remains ambiguous, submit a failed or ambiguous outcome and preserve prior catalogue evidence.

When rechecking an existing dish, reuse its exact dish id for the same named preparation and modification. Keep differently modified preparations as separate dish records. New dish ids should be stable kebab-case identifiers; never replace an existing id just to rename a dish.

Exact runtime schema
The import envelope is {"runId":"unique-run-id","venues":[],"outcomes":[]}. Normal runs have at most 20 venues (8 discoveries plus 12 rechecks); the one-time initial seed may contain up to 60.

Venue object:
{"id":"stable-branch-id","branchKey":"stable-branch-key","name":"Venue name","type":"cafe","address":"Branch street address","suburb":"Auckland suburb","latitude":-36.85,"longitude":174.76,"officialUrl":"https://venue.example/","brand":{"id":"stable-lowercase-id","name":"Brand name"},"dishes":[],"highChair":"unknown"}
Required type is cafe, pub, gastropub, or restaurant. Latitude and longitude are numbers or null. Optional venue properties are officialUrl, brand, highChairEvidence, mealNotes, familyNotes, and lastCheckedAt. mealNotes must identify substantive main-meal options only; use familyNotes for access, setting, and other family details.

Dish object:
{"id":"stable-dish-id","name":"Exact menu name","vegan":true,"glutenFree":true,"evidence":[{"url":"https://venue.example/menu","excerpt":"The menu labels this dish vegan and gluten free.","checkedAt":"2026-10-09","status":"menu-supported"}],"notes":"Optional supported modification"}
Each dish may also have optional price and notes. Do not set glutenFree true from ingredient inference. Evidence URL and excerpt must support the labels recorded for that dish.

Evidence object:
{"url":"https://venue.example/menu","excerpt":"Short source excerpt","checkedAt":"2026-10-09","status":"menu-supported"}
Allowed statuses are menu-supported, venue-confirmed, visit-reported, and needs-checking. Dates must be real calendar dates in YYYY-MM-DD format. URL must be HTTP or HTTPS.

High-chair details
highChair is available, unavailable, or unknown. When known, include highChairEvidence using the evidence shape and a dated source. Do not treat child-friendly facilities as proof of a high chair. User diary reports must remain private and are not available to this research service.

Outcome object:
{"target":"stable-branch-key","status":"success"}
Optional properties are message and sourceUrl. target should exactly match the venue branchKey (or venue id). status is success, failed, ambiguous, or unchanged. Failed and ambiguous outcomes matching a venue prevent that venue update. Never mark a failed retrieval as verified.

Import and verification
POST the exact import envelope to /api/research/import using the private Sites service authorization for this Site. Then GET /api/research/catalogue and verify that accepted branch records are present. Imports merge by branchKey, preserve prior evidence when a retrieval fails or is ambiguous, record catalogue changes for review, and are idempotent by runId. Report only run state and aggregate counts in the research run summary; do not copy private user state into outcomes, messages, or evidence.`;
