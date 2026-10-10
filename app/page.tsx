import { requireChatGPTUser } from "./chatgpt-auth";
import DiningApp from "@/components/dining-app";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireChatGPTUser("/");
  return <DiningApp displayName={user.displayName} />;
}
