import { importResearch, getResearchCatalogue } from "@/lib/store";
import { ResearchImportSchema } from "@/lib/domain";
import { researchInstructions } from "@/lib/research-instructions";

const evidenceSchema = {
  type: "object",
  properties: { url: { type: "string", format: "uri" }, excerpt: { type: "string", maxLength: 500 }, checkedAt: { type: "string", format: "date" }, status: { type: "string", enum: ["menu-supported", "venue-confirmed", "visit-reported", "needs-checking"] } },
  required: ["url", "excerpt", "checkedAt", "status"],
  additionalProperties: false,
};
const venueSchema = {
  type: "object",
  properties: {
    id: { type: "string" }, branchKey: { type: "string" }, name: { type: "string" }, type: { type: "string", enum: ["cafe", "pub", "gastropub", "restaurant"] },
    address: { type: "string" }, suburb: { type: "string" }, latitude: { type: ["number", "null"] }, longitude: { type: ["number", "null"] },
    officialUrl: { type: "string", format: "uri" },
    dishes: { type: "array", maxItems: 80, items: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, vegan: { type: "boolean" }, glutenFree: { type: "boolean" }, evidence: { type: "array", items: evidenceSchema }, price: { type: "string" }, notes: { type: "string" } }, required: ["id", "name", "vegan", "glutenFree", "evidence"], additionalProperties: false } },
    highChair: { type: "string", enum: ["available", "unavailable", "unknown"] }, highChairEvidence: evidenceSchema, mealNotes: { type: "string" }, familyNotes: { type: "string" }, lastCheckedAt: { type: "string", format: "date" },
  },
  required: ["id", "branchKey", "name", "type", "address", "suburb", "latitude", "longitude", "dishes", "highChair"],
  additionalProperties: false,
};
const tools = [
  {
    name: "catalogue_read",
    description: "Read the private venue catalogue for research. Does not include diary visits or preferences.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "research_import",
    description: "Submit a bounded catalogue research run. Never reads or changes visits or preferences.",
    inputSchema: {
      type: "object",
      properties: {
        runId: { type: "string", minLength: 1, maxLength: 160 },
        venues: { type: "array", maxItems: 60, items: venueSchema },
        outcomes: {
          type: "array",
          maxItems: 100,
          items: {
            type: "object",
            properties: {
              target: { type: "string" },
              status: { type: "string", enum: ["success", "failed", "ambiguous", "unchanged"] },
              message: { type: "string" },
              sourceUrl: { type: "string", format: "uri" },
            },
            required: ["target", "status"],
            additionalProperties: false,
          },
        },
      },
      required: ["runId"],
      additionalProperties: false,
    },
  },
  {
    name: "research_instructions",
    description: "Read the weekly private catalogue research workflow and full runtime payload schema.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

function reply(id: unknown, result: unknown) { return Response.json({ jsonrpc: "2.0", id, result }); }
function rpcError(id: unknown, code: number, message: string) { return Response.json({ jsonrpc: "2.0", id, error: { code, message } }); }

export async function POST(request: Request) {
  // MCP is exposed only through the owner-private Sites boundary.
  let body: { id?: unknown; method?: string; params?: { name?: string; arguments?: unknown } };
  try { body = await request.json() as typeof body; } catch { return rpcError(null, -32700, "Parse error"); }
  const id = body.id ?? null;
  if (body.method === "server/discover") return reply(id, { supportedVersions: ["2026-07-28"], capabilities: { tools: {} } });
  if (body.method === "initialize") return reply(id, { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "auckland-kind-table", version: "1.0.0" } });
  if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
  if (body.method === "ping") return reply(id, {});
  if (body.method === "tools/list") return reply(id, { tools });
  if (body.method !== "tools/call") return rpcError(id, -32601, "Method not found");
  const name = body.params?.name;
  try {
    let result: unknown;
    if (name === "catalogue_read") result = await getResearchCatalogue();
    else if (name === "research_instructions") result = { instructions: researchInstructions };
    else if (name === "research_import") result = await importResearch(ResearchImportSchema.parse(body.params?.arguments));
    else return rpcError(id, -32602, "Unknown tool");
    return reply(id, { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result, isError: false });
  } catch (error) {
    return reply(id, { content: [{ type: "text", text: error instanceof Error ? error.message : "Tool failed" }], isError: true });
  }
}
