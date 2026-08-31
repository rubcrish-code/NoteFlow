export const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export type MenuNavigationKey = "ArrowDown" | "ArrowUp" | "End" | "Home";

export function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => (
    !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true"
  ));
}

export function getMenuTargetIndex(key: MenuNavigationKey, currentIndex: number, itemCount: number) {
  if (itemCount <= 0) {
    return -1;
  }
  if (key === "Home") {
    return 0;
  }
  if (key === "End") {
    return itemCount - 1;
  }
  if (key === "ArrowUp") {
    return currentIndex <= 0 ? itemCount - 1 : currentIndex - 1;
  }
  return currentIndex < 0 || currentIndex >= itemCount - 1 ? 0 : currentIndex + 1;
}
