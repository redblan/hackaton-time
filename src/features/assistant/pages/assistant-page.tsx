import { isDemoMode } from "@/shared/ai/llm";
import { PageHeader } from "@/shared/components/page-header";
import { Chat } from "../components/chat";

export async function AssistantPage() {
  return (
    <>
      <PageHeader title="ИИ-ассистент" description="Отвечает на вопросы по данным платформы" />
      <Chat demo={isDemoMode()} />
    </>
  );
}
