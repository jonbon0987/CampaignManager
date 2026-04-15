import './_env';
import Anthropic from '@anthropic-ai/sdk';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages, system } = req.body as {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    system: string;
  };

  if (!messages || !system) {
    return res.status(400).json({ error: 'Missing messages or system prompt' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    let done = false;
    for (let attempt = 0; attempt < 3 && !done; attempt++) {
      try {
        const stream = client.messages.stream({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 8192,
          system,
          messages,
        });

        stream.on('text', (text) => {
          res.write(`data: ${JSON.stringify({ type: 'text', text })}\n\n`);
        });

        await stream.finalMessage();
        done = true;
      } catch (err) {
        const isRetryable = err instanceof Anthropic.APIError &&
          (err.status === 529 || err.status === 503 || err.status === 500);
        if (isRetryable && attempt < 2) {
          await new Promise(r => setTimeout(r, (attempt + 1) * 3000));
          continue;
        }
        throw err;
      }
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (err) {
    const message = err instanceof Anthropic.APIError
      ? err.status === 529
        ? 'Claude is currently overloaded. Please wait a moment and try again.'
        : `API Error (${err.status}): ${err.message}`
      : err instanceof Error ? err.message : 'Unknown error';
    res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
    res.end();
  }
}
