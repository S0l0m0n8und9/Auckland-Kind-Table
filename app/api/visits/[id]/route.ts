import { getCatalogue, saveVisit, deleteVisit } from "@/lib/store";
import { VisitSchema, replaceVisit } from "@/lib/domain";
import { jsonError, requireOwner } from "@/lib/api";

type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, context: Context) {
  if (!(await requireOwner())) return jsonError("Authentication required", 401);
  try {
    const { id } = await context.params;
    const existing = (await getCatalogue()).visits.find((item) => item.id === id);
    if (!existing) return jsonError("Visit not found", 404);
    const patch = await request.json();
    const visit = VisitSchema.parse({ ...existing, ...(patch as object), id, venueId: existing.venueId });
    return Response.json(await saveVisit(visit, id));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Invalid visit", 400);
  }
}
export async function PUT(request: Request, context: Context) {
  if (!(await requireOwner())) return jsonError("Authentication required", 401);
  try {
    const { id } = await context.params;
    const existing = (await getCatalogue()).visits.find((item) => item.id === id);
    if (!existing) return jsonError("Visit not found", 404);
    const visit = replaceVisit(existing, await request.json());
    return Response.json(await saveVisit(visit, id));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Invalid visit", 400);
  }
}
export async function DELETE(_request: Request, context: Context) {
  if (!(await requireOwner())) return jsonError("Authentication required", 401);
  const { id } = await context.params;
  return (await deleteVisit(id)) ? new Response(null, { status: 204 }) : jsonError("Visit not found", 404);
}
