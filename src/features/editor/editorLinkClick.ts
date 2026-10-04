import { safeExternalLinkHref } from "../../shared/safeLinkHref";

export function handleEditorLinkClick(event: MouseEvent, openUrl: (url: string) => void, openAnchor?: (anchor: string) => void): boolean {
  const target = event.target;
  if (!(target instanceof Element)) return false;
  const anchor = target.closest<HTMLAnchorElement>("a[href]");
  if (!anchor) return false;

  const href = anchor.getAttribute("href") ?? "";
  if (href.startsWith("#")) {
    event.preventDefault();
    if (event.button === 0) openAnchor?.(href);
    return true;
  }
  const url = safeExternalLinkHref(href);
  if (!url) {
    event.preventDefault();
    return true;
  }
  if (event.button !== 0 || (!event.ctrlKey && !event.metaKey)) return false;

  event.preventDefault();
  openUrl(url);
  return true;
}
