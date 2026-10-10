import { getCatalogue } from "@/lib/store";
import { jsonError, requireOwner } from "@/lib/api";

export async function GET() {
  if (!(await requireOwner())) return jsonError("Authentication required", 401);
  return Response.json(await getCatalogue());
}
