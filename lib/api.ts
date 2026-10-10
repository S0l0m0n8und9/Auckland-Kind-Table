import { getChatGPTUser } from "@/app/chatgpt-auth";

export async function requireOwner() {
  return (await getChatGPTUser()) !== null;
}

export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}
