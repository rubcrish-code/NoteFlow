export async function exportAfterFlush<T>(flush: () => Promise<void>, exportSaved: () => Promise<T>): Promise<T> {
  try { await flush(); }
  catch { throw new Error("Не удалось сохранить изменения перед экспортом."); }
  return exportSaved();
}
