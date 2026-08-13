/** Shared AI provider utilities for the frontend. */

export type AIProvider = 'claude' | 'gemini';

// The active provider is controlled solely by VITE_AI_PROVIDER in the .env
// files — there is no in-app switch. Default is Gemini (free tier); set
// VITE_AI_PROVIDER=claude to use Anthropic instead.
export function getAIProvider(): AIProvider {
  return import.meta.env.VITE_AI_PROVIDER === 'claude' ? 'claude' : 'gemini';
}
