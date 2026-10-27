export interface FragmentAnchor {
  quote: string;
  before: string;
  after: string;
}
export interface InternalNoteLink { noteId: string; fragment?: FragmentAnchor }
const noteIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const hashPattern = /^[a-f0-9]{64}$/;

export function parseInternalNoteLink(href: string): InternalNoteLink | null {
  if (href.length > 24000 || /[\u0000-\u0020\u007f]/.test(href)) return null;
  try {
    const url = new URL(href);
    if (url.protocol !== "noteflow:" || url.hostname !== "note" || url.username || url.password || url.port || url.hash) return null;
    const noteId = url.pathname.slice(1);
    if (!noteIdPattern.test(noteId)) return null;
    const keys = [...url.searchParams.keys()];
    if (keys.some((key) => !["quote", "before", "after"].includes(key)) || new Set(keys).size !== keys.length) return null;
    if (!keys.length) return { noteId };
    const quote = url.searchParams.get("quote");
    const before = url.searchParams.get("before");
    const after = url.searchParams.get("after");
    if (!quote || quote.length > 2000 || quote.trim() !== quote || /[\u0000-\u001f\u007f]/.test(quote) || !before || !after || !hashPattern.test(before) || !hashPattern.test(after)) return null;
    return { noteId, fragment: { quote, before, after } };
  } catch { return null; }
}

export function internalNoteHref(link: InternalNoteLink) {
  if (!noteIdPattern.test(link.noteId)) throw new Error("Invalid note identifier");
  const url = new URL(`noteflow://note/${link.noteId}`);
  if (link.fragment) {
    url.searchParams.set("quote", link.fragment.quote);
    url.searchParams.set("before", link.fragment.before);
    url.searchParams.set("after", link.fragment.after);
  }
  const href = url.href;
  if (!parseInternalNoteLink(href)) throw new Error("Invalid fragment link");
  return href;
}
