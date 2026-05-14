import { resolveProvider, generateText, friendlyError } from './_ai.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, provider: bodyProvider } = req.body as {
    prompt: string;
    provider?: string;
  };

  if (!prompt) {
    return res.status(400).json({ error: 'Missing prompt' });
  }

  try {
    const provider = resolveProvider(bodyProvider);
    const raw = await generateText({ provider, prompt });
    return res.status(200).json({ text: raw });
  } catch (err) {
    return res.status(500).json({ error: friendlyError(err) });
  }
}
