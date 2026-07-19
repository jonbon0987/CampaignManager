// Parsers for the assistant's streaming response.
//
// The model writes an optional ```plan block, then prose, then a ```json array
// of actions. All three arrive a token at a time, so everything here has to
// cope with input that is still being written.

export type StepState = 'pending' | 'active' | 'done';

export interface PlanStep {
  label: string;
  result?: string;
  state: StepState;
}

export interface PlanState {
  title: string;
  steps: PlanStep[];
}

// Extra fields the model attaches to an action for the UI. Stripped before the
// payload reaches the database.
export interface ActionAnnotations {
  reasoning?: string;
  confidence?: number;
  step?: number;
}

// Pull the contents of a fenced block, tolerating one that is still streaming
// and has no closing fence yet.
export function extractBlock(text: string, lang: 'json' | 'plan'): string | null {
  const closed = text.match(new RegExp('```' + lang + '\\s*([\\s\\S]*?)```'));
  if (closed) return closed[1];
  const open = text.match(new RegExp('```' + lang + '\\s*([\\s\\S]*)$'));
  return open ? open[1] : null;
}

// The prose the DM actually reads — everything outside the machine blocks.
export function stripBlocks(text: string): string {
  let result = text.replace(/```(?:json|plan)[\s\S]*?```/g, '');
  result = result.replace(/```(?:json|plan)[\s\S]*$/, '');
  return result.trim();
}

// Walk a (possibly still-streaming) JSON array and return every top-level
// object that has been fully written. This is what lets tray cards appear one
// by one as the model composes them, instead of all at once at the end.
export function parseCompleteObjects(block: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  let depth = 0;
  let start = -1;
  let inStr = false;
  let esc = false;

  for (let i = 0; i < block.length; i++) {
    const ch = block[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') { if (depth === 0) start = i; depth++; continue; }
    if (ch === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        try {
          out.push(JSON.parse(block.slice(start, i + 1)) as Record<string, unknown>);
        } catch {
          // Malformed object — skip it rather than abandon the whole array.
        }
        start = -1;
      }
    }
  }
  return out;
}

export function parsePlanBlock(text: string): PlanState | null {
  const block = extractBlock(text, 'plan');
  if (!block) return null;
  const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  const title = lines[0].replace(/^#+\s*/, '').replace(/^[-*]\s+/, '');
  const steps: PlanStep[] = lines.slice(1)
    .filter(l => /^[-*]\s+/.test(l))
    .map(l => ({ label: l.replace(/^[-*]\s+/, ''), state: 'pending' as StepState }));
  if (steps.length === 0) return null;
  return { title, steps };
}

// Separate the UI-only annotations from the action itself, so reasoning and
// confidence never travel into an upsert payload.
export function splitAnnotations(raw: Record<string, unknown>): {
  action: Record<string, unknown>;
  meta: ActionAnnotations;
} {
  const { reasoning, confidence, step, ...action } = raw;
  return {
    action,
    meta: {
      reasoning: typeof reasoning === 'string' ? reasoning : undefined,
      confidence: typeof confidence === 'number' ? confidence : undefined,
      step: typeof step === 'number' ? step : undefined,
    },
  };
}
