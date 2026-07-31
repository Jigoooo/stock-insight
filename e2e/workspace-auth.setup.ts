import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const username = process.env.STOCK_INSIGHT_E2E_USERNAME;
const password = process.env.STOCK_INSIGHT_E2E_PASSWORD;
const storageStatePath = process.env.WORKSPACE_VISUAL_STORAGE_STATE;

test('authenticates the workspace visual matrix once', async ({ page }) => {
  if (!username || !password || !storageStatePath) {
    throw new Error('Workspace visual auth setup requires credentials and a generated state path');
  }

  await page.goto('/login?redirect=%2Fworkspace%2Ftoday');
  await page.getByLabel('사용자 이름').fill(username);
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page).toHaveURL(/\/workspace\/today$/);
  await expect(page.getByTestId('research-workspace-v3')).toBeVisible();

  await mkdir(dirname(storageStatePath), { recursive: true });
  await page.context().storageState({ path: storageStatePath });
});
