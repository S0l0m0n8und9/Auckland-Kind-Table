import { researchInstructions } from "@/lib/research-instructions";
export async function GET() {
  // This route is reachable only inside the owner-private Sites audience.
  return Response.json({ instructions: researchInstructions });
}
