import { resolveProvider, streamChat, friendlyError } from './_ai.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages, system, provider: bodyProvider } = req.body as {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    system: string;
    provider?: string;
  };

  if (!messages || !system) {
    return res.status(400).json({ error: 'Missing messages or system prompt' });
  }

  const provider = resolveProvider(bodyProvider);

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
