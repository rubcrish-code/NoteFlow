export type CloseFlushResult = "completed" | "failed" | "timeout";

export function interceptCloseRequest(
  event: { preventDefault: () => void },
  isClosing: boolean,
  startClose: () => void,
) {
  event.preventDefault();
  if (!isClosing) startClose();
}

export function waitForCloseFlush(flush: () => Promise<void>, timeoutMs: number): Promise<CloseFlushResult> {
  return new Promise((resolve) => {
    const timeoutId = globalThis.setTimeout(() => resolve("timeout"), timeoutMs);
    void Promise.resolve().then(flush).then(
      () => {
        globalThis.clearTimeout(timeoutId);
        resolve("completed");
      },
      () => {
        globalThis.clearTimeout(timeoutId);
        resolve("failed");
      },
    );
  });
}
