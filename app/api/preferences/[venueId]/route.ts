import { PreferenceSchema } from "@/lib/domain";
import { jsonError, requireOwner } from "@/lib/api";
import { savePreference } from "@/lib/store";

type Context = { params: Promise<{ venueId: string }> };
export async function PUT(request: Request, context: Context) {
  if (!(await requireOwner())) return jsonError("Authentication required", 401);
  try {
    const { venueId } = await context.params;
    const body = await request.json() as { status?: unknown };
    const status = PreferenceSchema.parse(body?.status);
    await savePreference(venueId, status);
    return Response.json({ venueId, status });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Invalid preference", 400);
  }
}
