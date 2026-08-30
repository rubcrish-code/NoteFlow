import { convertFileSrc } from "@tauri-apps/api/core";
import type { EditorDocument, EditorNode } from "./markdownService";

export const assetUriPrefix = "noteflow-asset://";
const assetIdPattern = /^[a-f0-9]{64}$/i;

export function canonicalAssetUri(value: string) {
  const assetId = readAssetId(value);
  return assetId ? `${assetUriPrefix}${assetId.toLowerCase()}` : value;
}

export function runtimeAssetUrl(value: string) {
  const assetId = readAssetId(value);
  if (!assetId || typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
    return value;
  }
  return convertFileSrc(assetId.toLowerCase(), "noteflow-asset");
}

export function normalizeDocumentAssetUris(document: EditorDocument): EditorDocument {
  return normalizeNode(document) as EditorDocument;
}

function normalizeNode(node: EditorNode): EditorNode {
  const attrs = node.attrs ? { ...node.attrs } : undefined;
  if (node.type === "image" && attrs) {
    for (const key of ["src", "originalSrc"] as const) {
      if (typeof attrs[key] === "string") {
        attrs[key] = canonicalAssetUri(attrs[key]);
      }
    }
  }
  return {
    ...node,
    ...(attrs ? { attrs } : {}),
    ...(node.content ? { content: node.content.map(normalizeNode) } : {}),
  };
}

function readAssetId(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith(assetUriPrefix)) {
    const candidate = trimmed.slice(assetUriPrefix.length).replace(/^localhost\//, "");
    return assetIdPattern.test(candidate) ? candidate : undefined;
  }
  try {
    const url = new URL(trimmed);
    if (url.hostname === "noteflow-asset.localhost" || url.protocol === "noteflow-asset:") {
      const candidate = url.pathname.replace(/^\//, "");
      return assetIdPattern.test(candidate) ? candidate : undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
}
