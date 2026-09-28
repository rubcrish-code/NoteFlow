import { safeExternalLinkHref } from "../../shared/safeLinkHref";

export function handleEditorLinkClick(event: MouseEvent, openUrl: (url: string) => void): boolean {
  const target = event.target;
  if (!(target instanceof Element)) return false;
  const anchor = target.closest<HTMLAnchorElement>("a[href]");
  if (!anchor) return false;

  const url = safeExternalLinkHref(anchor.getAttribute("href") ?? "");
  if (!url) {
    event.preventDefault();
    return true;
  }
  if (event.button !== 0 || (!event.ctrlKey && !event.metaKey)) return false;

  event.preventDefault();
  openUrl(url);
  return true;
}
