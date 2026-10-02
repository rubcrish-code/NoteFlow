import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { getMenuTargetIndex } from "../src/shared/uiA11y";

describe("NoteFlow UI foundation", () => {
  it("navigates menus predictably with arrows, Home and End", () => {
    assert.equal(getMenuTargetIndex("ArrowDown", -1, 3), 0);
    assert.equal(getMenuTargetIndex("ArrowDown", 2, 3), 0);
    assert.equal(getMenuTargetIndex("ArrowUp", 0, 3), 2);
    assert.equal(getMenuTargetIndex("Home", 2, 3), 0);
    assert.equal(getMenuTargetIndex("End", 0, 3), 2);
    assert.equal(getMenuTargetIndex("ArrowDown", 0, 0), -1);
  });

  it("defines semantic spacing, typography, surface and motion tokens", () => {
    const tokens = readFileSync("src/styles/tokens.css", "utf8");

    for (const token of [
      "--space-1",
      "--space-2",
      "--space-4",
      "--space-8",
      "--text-primary",
      "--text-secondary",
      "--surface-elevated",
      "--border-focus",
      "--radius-control",
      "--radius-modal",
      "--shadow-popover",
      "--motion-fast",
      "--motion-panel",
      "--ease-standard",
    ]) {
      assert.ok(tokens.includes(`${token}:`), `${token} must be part of the foundation`);
    }
  });

  it("provides physical-width layout policies and a reduced-motion fallback", () => {
    const foundation = readFileSync("src/styles/foundation.css", "utf8");
    const pageShell = readFileSync("src/features/navigation/PageShell.tsx", "utf8");
    const settings = readFileSync("src/features/settings/SettingsPage.tsx", "utf8");
    const rag = readFileSync("src/features/rag/RagChatPage.tsx", "utf8");

    assert.match(pageShell, /useObservedPhysicalElementWidth/);
    assert.match(settings, /useObservedPhysicalElementWidth/);
    assert.match(rag, /useObservedPhysicalElementWidth/);
    assert.match(foundation, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(foundation, /transition-duration: 1ms !important/);
    assert.match(foundation, /\.page-shell,[\s\S]*\.rag-page[\s\S]*transition: grid-template-columns var\(--motion-panel\)/);
  });

  it("keeps modal semantics, focus trapping and focus restoration in one shell", () => {
    const modal = readFileSync("src/shared/ModalShell.tsx", "utf8");

    assert.match(modal, /aria-modal="true"/);
    assert.match(modal, /role="dialog"/);
    assert.match(modal, /event\.key !== "Tab"/);
    assert.match(modal, /event\.key === "Escape"/);
    assert.match(modal, /getFocusableElements\(shellRef\.current\)/);
    assert.match(modal, /previousFocus\?\.focus\(\)/);
    assert.match(modal, /dismissOnBackdrop/);
  });

  it("uses portal popovers and accessible tooltip and toast semantics", () => {
    const menu = readFileSync("src/shared/MenuPopover.tsx", "utf8");
    const tooltip = readFileSync("src/shared/TooltipPortal.tsx", "utf8");
    const toast = readFileSync("src/shared/Toast.tsx", "utf8");

    assert.match(menu, /createPortal/);
    assert.match(menu, /role = "menu"/);
    assert.match(menu, /role=\{role\}/);
    assert.match(menu, /\[role='menuitem'\]/);
    assert.match(tooltip, /aria-describedby/);
    assert.match(tooltip, /role="tooltip"/);
    assert.match(toast, /role=\{resolvedTone === "error" \? "alert" : "status"\}/);
    assert.match(toast, /aria-live=\{resolvedTone === "error" \? "assertive" : "polite"\}/);
  });
});
