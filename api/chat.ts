import { resolveProvider, streamChat, friendlyError } from './_ai.js';
import { requireAuth } from './_auth.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const userId = await requireAuth(req, res);
  if (!userId) return;

  const { messages, system } = req.body as {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    system: string;
  };

  if (!messages || !system) {
    return res.status(400).json({ error: 'Missing messages or system prompt' });
  }

  // Chat picks its own provider via CHAT_AI_PROVIDER, independent of imports and
  // generation — this is what lets chat run on Groq (fast, low-context) while
  // document import stays on Gemini's large-context free tier. Falls back to the
  // general VITE_AI_PROVIDER when CHAT_AI_PROVIDER is unset.
  const provider = resolveProvider(process.env.CHAT_AI_PROVIDER);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    await streamChat({
      provider,
      messages,
      system,
      onText(text) {
        res.write(`data: ${JSON.stringify({ type: 'text', text })}\n\n`);
      },
    });

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: friendlyError(err) })}\n\n`);
    res.end();
  }
}
