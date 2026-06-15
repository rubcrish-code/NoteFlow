const entityMap: Record<string, string> = {
  amp: "&",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

export function createNotePreview(sourceText: string, limit = 150) {
  const plainText = sourceText
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&([a-z]+);/gi, (_, entity: string) => entityMap[entity.toLowerCase()] ?? " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/```[\w-]*\n([\s\S]*?)```/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s{0,3}[-*+]\s+\[[ xX]\]\s+/gm, "")
    .replace(/^\s{0,3}[-*+]\s+/gm, "")
    .replace(/^\s{0,3}\d+\.\s+/gm, "")
    .replace(/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/gm, " ")
    .replace(/[|*_`~=#\[\]{}]/g, " ")
    .replace(/<\/?u>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (plainText.length <= limit) {
    return plainText;
  }

  const clippedText = plainText.slice(0, Math.max(0, limit - 1)).trimEnd();
  const lastSpaceIndex = clippedText.lastIndexOf(" ");
  const shortenedText = lastSpaceIndex > Math.floor(limit * 0.65) ? clippedText.slice(0, lastSpaceIndex) : clippedText;
  return `${shortenedText.trimEnd()}…`;
}
