import { deviceAuth } from "@/lib/auth";
import { body, endpoint } from "@/lib/http";
import { conversationCommand, conversations } from "@/lib/conversations";
import { rateLimit } from "@/lib/rate-limit";

export const POST = endpoint(async (request) => {
  const session = await deviceAuth(request);
  await rateLimit(`chats:${session.id}`, 600, 60);
  const command = await body(request, conversationCommand);
  return Response.json(await conversations(session.userId, command), {
    headers: { "Cache-Control": "no-store" },
  });
});
