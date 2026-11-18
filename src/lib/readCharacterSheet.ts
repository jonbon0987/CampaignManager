// Reads one character sheet PDF in the browser. A fillable sheet is read from
// its form fields here, exactly and without sending the file anywhere. For any
// other PDF only its text goes to the AI (api/parse-character-sheet), never the
// file itself, which also keeps big sheets under the upload limit.

import { authHeaders } from './apiClient';
import { getAIProvider } from './aiProvider';
import { cleanSheetValues, fromFormFields, readEnough, type SheetValues } from './characterSheet';

export interface SheetRead {
  file: string;
  values: SheetValues;
  /** 'form': read from the sheet's fields. 'ai': pulled from its text by the assistant. */
  source: 'form' | 'ai';
}

const MAX_BYTES = 8 * 1024 * 1024;

const MAX_TEXT = 60_000;

/** A PDF's fillable form fields (name → value; empty for a sheet without any) and its text. */
export async function readPdf(data: Uint8Array): Promise<{ fields: Record<string, string>; text: string }> {
  // pdf.js is large; it loads only when a sheet is imported.
  const { getDocumentProxy, extractText } = await import('unpdf');
  const pdf = await getDocumentProxy(data);
  try {
    const fields: Record<string, string> = {};
    const keep = (name: string | undefined, v: unknown) => {
      if (!name || name in fields) return;
      if (typeof v === 'string' && v.trim() && v !== 'Off') fields[name] = v;
      else if (typeof v === 'number') fields[name] = String(v);
    };
    // The document's form, when it declares one…
    const objects = (await pdf.getFieldObjects()) ?? {};
    for (const [name, entries] of Object.entries(objects)) {
      for (const entry of entries as { value?: unknown }[]) keep(name, entry.value);
    }
    // …and the fields drawn on each page, which is all D&D Beyond's export has
    // (its widgets aren't listed in a document-level form).
    for (let n = 1; n <= pdf.numPages; n++) {
      const annotations = await (await pdf.getPage(n)).getAnnotations();
      for (const a of annotations as { fieldName?: string; fieldValue?: unknown }[]) keep(a.fieldName, a.fieldValue);
    }
    const { text } = await extractText(pdf, { mergePages: true });
    return { fields, text: (Array.isArray(text) ? text.join('\n') : text).trim() };
  } finally {
    await pdf.loadingTask.destroy();
  }
}

/** Reads a sheet: its form fields when it has them, else the assistant reads its text. */
export async function readCharacterSheet(file: File): Promise<SheetRead> {
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') throw new Error(`${file.name} isn’t a PDF.`);
  if (file.size > MAX_BYTES) throw new Error(`${file.name} is over 8 MB.`);
  const bytes = new Uint8Array(await file.arrayBuffer());

  let pdf: { fields: Record<string, string>; text: string };
  try {
    pdf = await readPdf(bytes);
  } catch {
    throw new Error(`${file.name} couldn’t be opened as a PDF.`);
  }
  const fromForm = fromFormFields(pdf.fields);
  if (readEnough(fromForm)) return { file: file.name, values: fromForm, source: 'form' };
  if (pdf.text.length < 40) {
    throw new Error(`${file.name} has no text to read; it may be a scan. Export the sheet again as a PDF, or use a fillable sheet.`);
  }

  const res = await fetch('/api/parse-character-sheet', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ text: pdf.text.slice(0, MAX_TEXT), filename: file.name, provider: getAIProvider() }),
  });
  const data = await res.json().catch(() => ({})) as { values?: unknown; error?: string };
  if (!res.ok || data.error) throw new Error(data.error ?? `Server error: ${res.status}`);
  return { file: file.name, values: cleanSheetValues(data.values), source: 'ai' };
}
