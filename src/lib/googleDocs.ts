// Google Docs links, for the document import. The server fetches a doc's text
// export from Google, so it takes only the document id from the link the DM
// pastes, checks it, and builds the request itself: the request goes to
// docs.google.com, for that one document, and nowhere else.

const DOC_ID = /^[A-Za-z0-9_-]{10,200}$/;

/** The document id in a Google Docs link, or null when the link isn't one. */
export function googleDocId(link: string): string | null {
  let url: URL;
  try { url = new URL(link.trim()); } catch { return null; }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.hostname !== 'docs.google.com') return null;
  const id = /^\/document\/(?:u\/\d+\/)?d\/([^/]+)/.exec(url.pathname)?.[1];
  return id && DOC_ID.test(id) ? id : null;
}

/** Where Google serves a document's plain text. */
export function googleDocExportUrl(id: string): string {
  return `https://docs.google.com/document/d/${encodeURIComponent(id)}/export?format=txt`;
}
