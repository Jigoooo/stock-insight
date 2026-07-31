import { rmSync } from 'node:fs';

export default function removeGeneratedWorkspaceStorageState() {
  const storageStatePath = process.env.WORKSPACE_VISUAL_STORAGE_STATE;
  if (storageStatePath) rmSync(storageStatePath, { force: true });
}
