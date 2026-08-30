import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { assetUriPrefix, canonicalAssetUri, normalizeDocumentAssetUris, runtimeAssetUrl } from "../src/features/editor/assetUri";
import { buildEditorDocumentFromStoredNoteContent, serializeEditorDocumentForStorage } from "../src/features/editor/editorContentSerializer";
import type { EditorDocument } from "../src/features/editor/markdownService";

const assetId = "a".repeat(64);
const canonicalUri = `${assetUriPrefix}${assetId}`;

describe("canonical managed assets", () => {
  it("canonicalizes Windows and custom-protocol runtime URLs without touching external URLs", () => {
    assert.equal(canonicalAssetUri(`http://noteflow-asset.localhost/${assetId}`), canonicalUri);
    assert.equal(canonicalAssetUri(`noteflow-asset://localhost/${assetId}`), canonicalUri);
    assert.equal(canonicalAssetUri("https://example.com/image.png"), "https://example.com/image.png");
  });

  it("keeps persisted image attrs canonical while preserving edit presentation attrs", () => {
    const document: EditorDocument = {
      type: "doc",
      content: [
        {
          type: "image",
          attrs: {
            alignment: "right",
            attachmentId: "attachment-current",
            editedAttachmentId: "attachment-edited",
            editMetadata: { mode: "crop", source: "managed" },
            height: 320,
            originalSrc: `http://noteflow-asset.localhost/${assetId}`,
            src: `http://noteflow-asset.localhost/${assetId}`,
            width: 640,
          },
        },
      ],
    };
    const normalized = normalizeDocumentAssetUris(document);
    const image = normalized.content?.[0];
    assert.equal(image?.attrs?.src, canonicalUri);
    assert.equal(image?.attrs?.originalSrc, canonicalUri);
    assert.equal(image?.attrs?.alignment, "right");
    assert.equal(image?.attrs?.width, 640);
    assert.equal(image?.attrs?.height, 320);
    assert.deepEqual(image?.attrs?.editMetadata, { mode: "crop", source: "managed" });
  });

  it("reloads canonical image resize, alignment, crop and annotation metadata from the persisted sidecar", () => {
    const serialized = serializeEditorDocumentForStorage({
      type: "doc",
      content: [
        {
          type: "image",
          attrs: {
            alignment: "right",
            alt: "Схема",
            attachmentId: "attachment-edited",
            editedAttachmentId: "attachment-edited",
            editMetadata: { mode: "draw", originalWidth: 1600 },
            height: 450,
            originalAttachmentId: "attachment-original",
            originalSrc: canonicalUri,
            src: canonicalUri,
            width: 800,
          },
        },
      ],
    });
    const reloaded = buildEditorDocumentFromStoredNoteContent({
      contentJson: serialized.editorDocument,
      contentMarkdown: serialized.contentMarkdown,
      contentSidecars: serialized.contentSidecars.map((sidecar) => ({
        createdAt: "2026-08-30T00:00:00Z",
        kind: sidecar.kind,
        payloadJson: sidecar.payloadJson,
        schemaVersion: sidecar.schemaVersion,
        updatedAt: "2026-08-30T00:00:00Z",
      })),
      plainText: serialized.plainText,
    });
    const image = reloaded.editorDocument.content?.[0];
    assert.equal(image?.attrs?.src, canonicalUri);
    assert.equal(image?.attrs?.originalSrc, canonicalUri);
    assert.equal(image?.attrs?.alignment, "right");
    assert.equal(image?.attrs?.width, 800);
    assert.equal(image?.attrs?.height, 450);
    assert.equal(image?.attrs?.editedAttachmentId, "attachment-edited");
    assert.deepEqual(image?.attrs?.editMetadata, { mode: "draw", originalWidth: 1600 });
  });

  it("serializes only logical asset URIs into Markdown, HTML, JSON cache and sidecar", () => {
    const serialized = serializeEditorDocumentForStorage({
      type: "doc",
      content: [
        {
          type: "image",
          attrs: {
            alignment: "center",
            attachmentId: "attachment-current",
            originalAttachmentId: "attachment-original",
            originalSrc: canonicalUri,
            src: canonicalUri,
            width: 720,
          },
        },
      ],
    });
    const persisted = JSON.stringify(serialized);
    assert.match(serialized.contentMarkdown, new RegExp(canonicalUri));
    assert.match(serialized.contentHtml, new RegExp(canonicalUri));
    assert.doesNotMatch(persisted, /data:image\//);
    assert.doesNotMatch(persisted, /file:\/\//);
    assert.doesNotMatch(persisted, /noteflow-asset\.localhost/);
  });

  it("does not resolve external images through the managed protocol", () => {
    assert.equal(runtimeAssetUrl("https://example.com/image.png"), "https://example.com/image.png");
    assert.equal(runtimeAssetUrl(canonicalUri), canonicalUri);
  });

  it("uses native path ingest and ID-only open/reveal commands", () => {
    const service = readFileSync("src/services/dataService.ts", "utf8");
    const appTypes = readFileSync("src/app/types.ts", "utf8");
    const blockMenu = readFileSync("src/features/editor/BlockInsertMenu.tsx", "utf8");
    assert.match(service, /store_attachment_from_path/);
    assert.match(service, /invoke<void>\("open_attachment", \{ attachmentId \}\)/);
    assert.match(service, /invoke<void>\("reveal_attachment", \{ attachmentId \}\)/);
    assert.doesNotMatch(service, /resolve_attachment_path/);
    assert.doesNotMatch(service, /storageRelPath/);
    assert.doesNotMatch(appTypes, /storageRelPath/);
    assert.doesNotMatch(blockMenu, /readAsDataURL|FileReader/);
    assert.match(blockMenu, /stored\.attachment\.assetUri/);
  });
});
