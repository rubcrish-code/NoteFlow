export interface BackupImportResult<TWorkspace> {
  workspace: TWorkspace;
}

interface RestoreWorkspaceBackupOptions<TWorkspace, TResult extends BackupImportResult<TWorkspace>> {
  applyWorkspace: (workspace: TWorkspace) => void;
  file: File;
  flushPendingSave: () => Promise<void>;
  importBackup: (file: File) => Promise<TResult>;
  invalidatePendingSaves: () => void;
  refreshExternalViews: () => void;
}

export async function restoreWorkspaceBackup<
  TWorkspace,
  TResult extends BackupImportResult<TWorkspace>,
>({
  applyWorkspace,
  file,
  flushPendingSave,
  importBackup,
  invalidatePendingSaves,
  refreshExternalViews,
}: RestoreWorkspaceBackupOptions<TWorkspace, TResult>) {
  await flushPendingSave();
  const result = await importBackup(file);
  invalidatePendingSaves();
  applyWorkspace(result.workspace);
  refreshExternalViews();
  return result;
}
