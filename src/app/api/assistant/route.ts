import { z } from "zod";
import { getCurrentUser } from "@/shared/auth";
import { answer } from "@/features/assistant/server";

const bodySchema = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) })).min(1),
});

export async function POST(req: Request) {
  if (!(await getCurrentUser())) return new Response("Unauthorized", { status: 401 });
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return new Response("Bad request", { status: 400 });
  try {
    const stream = await answer(parsed.data.messages);
    return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  } catch (e) {
    console.error(e);
    return new Response("Ассистент временно недоступен", { status: 502 });
  }
}
