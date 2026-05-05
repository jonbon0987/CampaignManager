/** Shared AI provider utilities for the frontend. */

export type AIProvider = 'claude' | 'gemini';

const STORAGE_KEY = 'dnd-ai-provider';

export function getAIProvider(): AIProvider {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed === 'gemini') return 'gemini';
    }
  } catch {
    // ignore
  }
  // Fall back to env var
  const env = import.meta.env.VITE_AI_PROVIDER;
  if (env === 'gemini') return 'gemini';
  return 'claude';
}

export function setAIProvider(provider: AIProvider) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(provider));
}
