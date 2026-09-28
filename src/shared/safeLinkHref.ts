export function sanitizeMarkdownLinkHref(href: string): string | undefined {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith("//") || /[\u0000-\u001f\u007f]/.test(trimmed)) return undefined;
  if (trimmed.startsWith("#") || trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("../")) return trimmed;
  try {
    const url = new URL(trimmed);
    return ["http:", "https:", "mailto:"].includes(url.protocol) && !url.username && !url.password ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

export function safeExternalLinkHref(href: string): string | undefined {
  const safeHref = sanitizeMarkdownLinkHref(href);
  if (!safeHref) return undefined;
  try {
    const url = new URL(safeHref);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}
