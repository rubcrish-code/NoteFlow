export interface SearchTextSegment {
  highlighted: boolean;
  text: string;
}

const maxSearchQueryCharacters = 256;

export function getSearchTerms(query: string) {
  return query
    .slice(0, maxSearchQueryCharacters)
    .split(/[^\p{L}\p{N}]+/u)
    .map((term) => term.trim().toLocaleLowerCase())
    .filter(Boolean);
}

export function splitSearchText(text: string, query: string): SearchTextSegment[] {
  const terms = getSearchTerms(query).sort((left, right) => right.length - left.length);
  if (terms.length === 0 || text.length === 0) {
    return [{ highlighted: false, text }];
  }

  const escapedTerms = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const matcher = new RegExp(`(${escapedTerms.join("|")})`, "giu");
  return text
    .split(matcher)
    .filter(Boolean)
    .map((segment) => ({
      highlighted: terms.includes(segment.toLocaleLowerCase()),
      text: segment,
    }));
}

export function getNextSearchResultIndex(currentIndex: number, resultCount: number, key: string) {
  if (resultCount === 0) {
    return -1;
  }
  if (key === "ArrowDown") {
    return currentIndex < resultCount - 1 ? currentIndex + 1 : 0;
  }
  if (key === "ArrowUp") {
    return currentIndex > 0 ? currentIndex - 1 : resultCount - 1;
  }
  return currentIndex;
}
