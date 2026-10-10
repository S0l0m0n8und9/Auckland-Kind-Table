import { env } from "cloudflare:workers";
import { jsonError, requireOwner } from "@/lib/api";

type Bucket = R2Bucket;
function bucket() { return (env as unknown as { BUCKET?: Bucket }).BUCKET; }
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const contentTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  if (!(await requireOwner())) return jsonError("Authentication required", 401);
  const target = bucket();
  if (!target) return jsonError("Private photo storage is not configured", 503);
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError("Expected a photo file", 400);
  if (file.size < 1 || file.size > MAX_PHOTO_BYTES || !contentTypes.has(file.type)) return jsonError("Use a JPEG, PNG, or WebP image under 8 MB", 400);
  const extension = file.type === "image/jpeg" ? "jpg" : file.type.slice("image/".length);
  const key = `${crypto.randomUUID()}.${extension}`;
  await target.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type, cacheControl: "private, no-store" } });
  return Response.json({ photoKey: key }, { status: 201 });
}
