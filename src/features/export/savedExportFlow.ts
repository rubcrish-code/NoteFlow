import { translate } from "../../shared/i18n";
export async function exportAfterFlush<T>(flush: () => Promise<void>, exportSaved: () => Promise<T>): Promise<T> {
  try { await flush(); }
  catch { throw new Error(translate("ui.c93e1d253df2")); }
  return exportSaved();
}
