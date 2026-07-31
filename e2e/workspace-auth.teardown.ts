import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const generatedAuthDirectory = fileURLToPath(
  new URL('../test-results/workspace-visual-auth/', import.meta.url),
);
const generatedStorageStatePath = resolve(generatedAuthDirectory, 'storage-state.json');

export default function removeGeneratedWorkspaceStorageState() {
  const storageStatePath = process.env.WORKSPACE_VISUAL_STORAGE_STATE;
  if (!storageStatePath) return;
  if (resolve(storageStatePath) !== generatedStorageStatePath) {
    throw new Error('Workspace visual auth teardown refused a non-generated storage state path');
  }
  rmSync(generatedAuthDirectory, { recursive: true, force: true });
}
