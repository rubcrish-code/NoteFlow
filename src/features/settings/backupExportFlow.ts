export async function runBackupExport<Result>(
  selectPath: () => Promise<string | null>,
  writeBackup: (path: string) => Promise<Result>,
): Promise<Result | null> {
  const path = await selectPath();
  if (!path) return null;
  return writeBackup(path);
}
