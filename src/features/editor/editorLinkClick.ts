import { safeExternalLinkHref } from "../../shared/safeLinkHref";

export type EditorLink = { kind: "internal-anchor"; href: string } | { kind: "external-http"; href: string } | { kind: "blocked" };

export function classifyEditorLink(href: string): EditorLink {
  const trimmed = href.trim();
  if (trimmed.startsWith("#") && !/[\u0000-\u001f\u007f]/.test(trimmed)) return { kind: "internal-anchor", href: trimmed };
  const external = safeExternalLinkHref(trimmed);
  return external ? { kind: "external-http", href: external } : { kind: "blocked" };
}

export function handleEditorLinkClick(event: MouseEvent, openUrl: (url: string) => void, openAnchor?: (anchor: string) => void): boolean {
  const target = event.target;
  if (!(target instanceof Element)) return false;
  const anchor = target.closest<HTMLAnchorElement>("a[href]");
  if (!anchor) return false;

  // Cancel the DOM click itself before the WebView/opener's window-level listener.
  event.preventDefault();
  const link = classifyEditorLink(anchor.getAttribute("href") ?? "");
  if (link.kind === "internal-anchor") {
    if (event.button === 0) openAnchor?.(link.href);
    return true;
  }
  if (link.kind === "blocked") return true;
  if (event.button !== 0 || (!event.ctrlKey && !event.metaKey)) return false;

  openUrl(link.href);
  return true;
}
