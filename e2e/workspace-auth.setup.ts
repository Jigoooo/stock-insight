import { expect, test } from '@playwright/test';
import { chmod, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const username = process.env.STOCK_INSIGHT_E2E_USERNAME;
const password = process.env.STOCK_INSIGHT_E2E_PASSWORD;
const storageStatePath = process.env.WORKSPACE_VISUAL_STORAGE_STATE;
const generatedAuthDirectory = fileURLToPath(
  new URL('../test-results/workspace-visual-auth/', import.meta.url),
);
const generatedStorageStatePath = resolve(generatedAuthDirectory, 'storage-state.json');

test('authenticates the workspace visual matrix once', async ({ page }) => {
  if (!username || !password || !storageStatePath) {
    throw new Error('Workspace visual auth setup requires credentials and a generated state path');
  }
  if (resolve(storageStatePath) !== generatedStorageStatePath) {
    throw new Error('Workspace visual auth setup refused a non-generated storage state path');
  }

  await page.goto('/login?redirect=%2Fworkspace%2Ftoday');
  await page.getByLabel('사용자 이름').fill(username);
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page).toHaveURL(/\/workspace\/today$/, { timeout: 20_000 });
  await expect(page.getByTestId('research-workspace-v3')).toBeVisible({ timeout: 15_000 });

  await mkdir(generatedAuthDirectory, { recursive: true, mode: 0o700 });
  await chmod(generatedAuthDirectory, 0o700);
  await page.context().storageState({ path: generatedStorageStatePath });
  await chmod(generatedStorageStatePath, 0o600);
});
