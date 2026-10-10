import { ResearchImportSchema } from "@/lib/domain";
import { importResearch } from "@/lib/store";
import { jsonError } from "@/lib/api";
export async function POST(request: Request) {
  // Hosted Site's private audience is the authentication boundary for service calls.
  try {
    const payload = ResearchImportSchema.parse(await request.json());
    return Response.json(await importResearch(payload));
  } catch (error) {
    console.error("research import failed validation or persistence", error instanceof Error ? error.message : "unknown error");
    return jsonError(error instanceof Error ? error.message : "Invalid research import", 400);
  }
}
