import { getResearchCatalogue } from "@/lib/store";
export async function GET() {
  // Hosted Site's private audience is the authentication boundary for service calls.
  return Response.json(await getResearchCatalogue());
}
