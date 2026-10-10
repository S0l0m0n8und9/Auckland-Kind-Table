import { env } from "cloudflare:workers";
import { getCatalogue } from "@/lib/store";
import { jsonError, requireOwner } from "@/lib/api";
type Bucket = R2Bucket;
export async function GET(_request: Request, context: { params: Promise<{ key: string }> }) {
  if (!(await requireOwner())) return jsonError("Authentication required", 401);
  const { key } = await context.params;
  if (!/^[0-9a-f-]+\.(jpg|png|webp)$/i.test(key)) return jsonError("Photo not found", 404);
  const catalogue = await getCatalogue();
  if (!catalogue.visits.some((visit) => visit.photoKey === key)) return jsonError("Photo not found", 404);
  const target = (env as unknown as { BUCKET?: Bucket }).BUCKET;
  if (!target) return jsonError("Private photo storage is not configured", 503);
  const object = await target.get(key);
  if (!object) return jsonError("Photo not found", 404);
  return new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType ?? "application/octet-stream", "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}
