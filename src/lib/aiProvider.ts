/** Shared AI provider utilities for the frontend. */

export type AIProvider = 'claude' | 'gemini';

const STORAGE_KEY = 'dnd-ai-provider';

export function getAIProvider(): AIProvider {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed === 'claude') return 'claude';
      if (parsed === 'gemini') return 'gemini';
    }
  } catch {
    // ignore
  }
  // Fall back to env var. Default is Gemini (free tier); set VITE_AI_PROVIDER=claude
  // (or pick Claude in the in-app provider toggle) to use Anthropic instead.
  const env = import.meta.env.VITE_AI_PROVIDER;
  if (env === 'claude') return 'claude';
  return 'gemini';
}

export function setAIProvider(provider: AIProvider) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(provider));
}
