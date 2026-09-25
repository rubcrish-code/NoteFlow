import type { RagMessageSource } from "../../services/ragChatService";

export interface RagCitationTextSegment {
  kind: "text";
  text: string;
}

export interface RagCitationSourceSegment {
  kind: "citation";
  source: RagMessageSource;
}

export type RagCitationSegment = RagCitationTextSegment | RagCitationSourceSegment;

export function splitRagCitationText(
  text: string,
  sources: readonly RagMessageSource[],
  isCode = false,
): RagCitationSegment[] {
  if (isCode || sources.length === 0) {
    return [{ kind: "text", text }];
  }
  const byId = sourceMap(sources);
  const segments: RagCitationSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(/\[\[(S\d+)\]\]/g)) {
    const sourceId = match[1];
    const source = sourceId ? byId.get(sourceId) : undefined;
    if (!source || match.index === undefined) {
      continue;
    }
    if (match.index > cursor) {
      segments.push({ kind: "text", text: text.slice(cursor, match.index) });
    }
    segments.push({ kind: "citation", source });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) {
    segments.push({ kind: "text", text: text.slice(cursor) });
  }
  return segments.length > 0 ? segments : [{ kind: "text", text }];
}

export function ragAnswerForClipboard(markdown: string, sources: readonly RagMessageSource[]) {
  const byId = sourceMap(sources);
  let output = "";
  let index = 0;
  let fenced = false;
  let inlineDelimiter = 0;
  while (index < markdown.length) {
    if (markdown[index] === "`") {
      const run = countRun(markdown, index, "`");
      if (inlineDelimiter === 0 && run >= 3) {
        fenced = !fenced;
      } else if (!fenced) {
        if (inlineDelimiter === 0) inlineDelimiter = run;
        else if (inlineDelimiter === run) inlineDelimiter = 0;
      }
      output += markdown.slice(index, index + run);
      index += run;
      continue;
    }
    if (!fenced && inlineDelimiter === 0 && markdown.startsWith("[[S", index)) {
      const marker = readMarker(markdown, index);
      if (marker) {
        const source = byId.get(marker.sourceId);
        output += source ? `[${source.citationNumber}]` : "";
        index += marker.raw.length;
        continue;
      }
    }
    const character = markdown.codePointAt(index);
    if (character === undefined) break;
    const value = String.fromCodePoint(character);
    output += value;
    index += value.length;
  }
  return output.replace(/\[\[(?:NO_EVIDENCE|S\d+)\]\]/g, "").trim();
}

export function ragCitationLabel(source: RagMessageSource) {
  const title = source.noteTitle.trim() || "Без названия";
  return `Источник ${source.citationNumber}: ${title}`;
}

function sourceMap(sources: readonly RagMessageSource[]) {
  return new Map(sources.map((source) => [source.sourceId, source]));
}

function readMarker(value: string, index: number) {
  const closing = value.indexOf("]]", index + 3);
  if (closing < 0) return null;
  const sourceId = value.slice(index + 2, closing);
  if (!/^S\d+$/.test(sourceId)) return null;
  return { sourceId, raw: value.slice(index, closing + 2) };
}

function countRun(value: string, start: number, character: string) {
  let length = 0;
  while (value[start + length] === character) length += 1;
  return length;
}
