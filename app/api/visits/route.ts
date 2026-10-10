import { saveVisit } from "@/lib/store";
import { VisitSchema } from "@/lib/domain";
import { jsonError, requireOwner } from "@/lib/api";

export async function POST(request: Request) {
  if (!(await requireOwner())) return jsonError("Authentication required", 401);
  try {
    const visit = await saveVisit(VisitSchema.parse(await request.json()));
    return Response.json(visit, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Invalid visit", 400);
  }
}
