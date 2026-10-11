import type { EditorView } from "@tiptap/pm/view";

interface SearchMatch { from: number; to: number }

export function scrollToSearchMatch(view: EditorView, match: SearchMatch, searchPanel: HTMLElement | null) {
  const container = view.dom.closest<HTMLElement>(".ed-scroll");
  if (!container || !container.offsetHeight || !container.clientHeight) return;

  const rect = container.getBoundingClientRect();
  // coordsAtPos is in screen pixels; scrollTop/clientHeight remain CSS pixels at app zoom.
  const scale = rect.height / container.offsetHeight;
  if (!Number.isFinite(scale) || scale <= 0) return;
  const top = Math.max(0, rect.top + container.clientTop * scale);
  let bottom = Math.min(window.innerHeight, rect.top + (container.clientTop + container.clientHeight) * scale);
  const panelRect = searchPanel?.getBoundingClientRect();
  if (panelRect && panelRect.top > top && panelRect.top < bottom && panelRect.right > rect.left && panelRect.left < rect.right) {
    bottom = panelRect.top;
  }
  if (bottom <= top) return;

  const start = view.coordsAtPos(match.from, 1);
  const end = view.coordsAtPos(match.to, -1);
  const matchCenter = (start.top + (end.top === start.top ? end.bottom : start.bottom)) / 2;
  const target = container.scrollTop + (matchCenter - (top + bottom) / 2) / scale;
  const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  container.scrollTo({ top: Math.max(0, Math.min(maxScroll, target)), behavior: reducedMotion ? "instant" : "smooth" });
}
