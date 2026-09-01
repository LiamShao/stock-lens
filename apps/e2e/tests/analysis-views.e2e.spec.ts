import { readFile } from 'node:fs/promises';

import {
  apiErrorResponseSchema,
  authResponseSchema,
  presignedDocumentDownloadSchema,
} from '@stocklens/shared';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import {
  E2E_ANALYSIS_TITLE,
  E2E_API_ORIGIN,
  E2E_DOCUMENT_NAME,
  E2E_INJECTION_SENTINEL,
  E2E_OWNER_A,
  E2E_OWNER_B,
} from '../support/constants';

let observedPresignedUrl: string | undefined;

test.describe.serial('VIEW-AC-001..016 analysis views', () => {
  test('owner A can use the three views and open the cited real PDF page safely', async ({
    context,
    page,
  }) => {
    let dialogWasOpened = false;
    page.on('dialog', (dialog) => {
      dialogWasOpened = true;
      void dialog.dismiss();
    });

    await page.goto('/login');
    await page.getByLabel('メールアドレス').fill(E2E_OWNER_A.email);
    await page.getByLabel('パスワード').fill(E2E_OWNER_A.password);
    await page.getByRole('button', { name: 'ログイン' }).click();

    await expect(page).toHaveURL(/\/analyses$/);
    await expect(
      page.getByRole('heading', { level: 1, name: '分析履歴' }),
    ).toBeVisible();
    await expect(
      page.getByText(E2E_ANALYSIS_TITLE, { exact: true }),
    ).toBeVisible();

    const refreshCookie = (
      await context.cookies(`${E2E_API_ORIGIN}/api/auth/refresh`)
    ).find((cookie) => cookie.name === 'stocklens_refresh_token');
    expect(refreshCookie).toMatchObject({
      httpOnly: true,
      path: '/api/auth',
      sameSite: 'Strict',
    });
    await expectClientStorageToBeEmpty(page);

    await page
      .getByRole('link', { name: new RegExp(E2E_ANALYSIS_TITLE) })
      .click();
    await expect(
      page.getByRole('heading', {
        exact: true,
        level: 1,
        name: E2E_ANALYSIS_TITLE,
      }),
    ).toBeVisible();
    await expect(page.getByText('完了', { exact: true })).toBeVisible();

    const justTellMeTab = page.getByRole('tab', { name: 'Just Tell Me' });
    const analystTab = page.getByRole('tab', { name: 'Analyst View' });
    const buffettMungerTab = page.getByRole('tab', {
      name: 'Buffett-Munger Lens',
    });
    await expect(justTellMeTab).toHaveAttribute('aria-selected', 'true');
    await justTellMeTab.focus();
    await page.keyboard.press('ArrowRight');
    await expect(analystTab).toBeFocused();
    await expect(analystTab).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('End');
    await expect(buffettMungerTab).toBeFocused();
    await expect(buffettMungerTab).toHaveAttribute('aria-selected', 'true');
    await expect(
      page.getByText(/人格模倣、推奨または承認を示すものではありません/),
    ).toBeVisible();
    await page.keyboard.press('Home');
    await expect(justTellMeTab).toBeFocused();
    await expect(
      page.getByRole('tabpanel').getByText('情報不足', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/投資助言、売買推奨、目標株価/)).toBeVisible();

    await page.setViewportSize({ height: 844, width: 390 });
    await page
      .getByRole('button', { name: /根拠 1を開く/ })
      .first()
      .click();
    const drawer = page.getByRole('dialog', { name: '根拠を確認' });
    await expect(drawer).toBeVisible();
    await expect(
      drawer.getByText(E2E_DOCUMENT_NAME, { exact: true }),
    ).toBeVisible();
    await expect(drawer.getByText('2ページ', { exact: true })).toBeVisible();
    await expect(
      drawer.getByText(E2E_INJECTION_SENTINEL, { exact: false }),
    ).toBeVisible();
    expect(dialogWasOpened).toBe(false);
    expect(
      await page.evaluate(() =>
        Boolean(
          (window as typeof window & { __stocklensInjected?: boolean })
            .__stocklensInjected,
        ),
      ),
    ).toBe(false);
    expect(
      (await page.locator('script').allTextContents()).some((content) =>
        content.includes('__stocklensInjected'),
      ),
    ).toBe(false);
    const drawerBox = await drawer.boundingBox();
    expect(drawerBox).not.toBeNull();
    expect(drawerBox?.x).toBeGreaterThanOrEqual(0);
    expect((drawerBox?.x ?? 0) + (drawerBox?.width ?? 0)).toBeLessThanOrEqual(
      390,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);

    const downloadResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().endsWith('/download-url'),
    );
    await drawer.getByRole('button', { name: '2ページをPDFで開く' }).click();
    const downloadResponse = await downloadResponsePromise;
    expect(downloadResponse.status()).toBe(200);
    const download = presignedDocumentDownloadSchema.parse(
      await downloadResponse.json(),
    );
    observedPresignedUrl = download.url;
    expect(
      new Date(download.expiresAt).getTime() - Date.now(),
    ).toBeLessThanOrEqual(5 * 60 * 1_000);

    await expect(
      drawer.getByRole('img', { name: 'PDF 2ページ' }),
    ).toBeVisible();
    await expect(
      drawer.getByText('2 / 3ページ', { exact: true }),
    ).toBeVisible();
    await drawer.getByRole('button', { name: '次のページ' }).click();
    await expect(
      drawer.getByRole('img', { name: 'PDF 3ページ' }),
    ).toBeVisible();
    await expect(
      drawer.getByText('3 / 3ページ', { exact: true }),
    ).toBeVisible();

    await expect(page.locator('a[href*="X-Amz-Signature"]')).toHaveCount(0);
    expect(await page.locator('body').innerText()).not.toContain(
      'X-Amz-Signature',
    );
    expect(page.url()).not.toContain('X-Amz-Signature');
    await expectClientStorageToBeEmpty(page);

    await page.getByRole('button', { name: '根拠ドロワーを閉じる' }).click();
    await page.reload();
    await expect(
      page.getByRole('heading', {
        exact: true,
        level: 1,
        name: E2E_ANALYSIS_TITLE,
      }),
    ).toBeVisible();
    await expect(justTellMeTab).toHaveAttribute('aria-selected', 'true');
    await expectClientStorageToBeEmpty(page);
  });

  test('owner B receives indistinguishable 404s without sensitive logs', async ({
    request,
  }) => {
    const analysisId = requiredEnvironment('STOCKLENS_E2E_ANALYSIS_ID');
    const documentId = requiredEnvironment('STOCKLENS_E2E_DOCUMENT_ID');
    const loginResponse = await request.post(
      `${E2E_API_ORIGIN}/api/auth/login`,
      {
        data: {
          email: E2E_OWNER_B.email,
          password: E2E_OWNER_B.password,
        },
      },
    );
    expect(loginResponse.status()).toBe(200);
    const auth = authResponseSchema.parse(await loginResponse.json());
    const headers = { authorization: `Bearer ${auth.accessToken}` };
    const responses = await Promise.all([
      request.get(`${E2E_API_ORIGIN}/api/analyses/${analysisId}`, { headers }),
      request.get(`${E2E_API_ORIGIN}/api/analyses/${analysisId}/views`, {
        headers,
      }),
      request.post(
        `${E2E_API_ORIGIN}/api/analyses/${analysisId}/documents/${documentId}/download-url`,
        { headers },
      ),
    ]);

    for (const response of responses) {
      expect(response.status()).toBe(404);
      const responseText = await response.text();
      const error = apiErrorResponseSchema.parse(JSON.parse(responseText));
      expect(error.code).toBe('ANALYSIS_NOT_FOUND');
      expect(responseText).not.toContain(E2E_ANALYSIS_TITLE);
      expect(responseText).not.toContain(E2E_DOCUMENT_NAME);
      expect(responseText).not.toContain(
        requiredEnvironment('STOCKLENS_E2E_STORAGE_KEY'),
      );
    }

    const logs = await readFile(
      requiredEnvironment('STOCKLENS_E2E_API_LOG_PATH'),
      'utf8',
    );
    for (const secret of [
      E2E_OWNER_A.password,
      E2E_OWNER_B.password,
      auth.accessToken,
      E2E_INJECTION_SENTINEL,
      requiredEnvironment('STOCKLENS_E2E_STORAGE_KEY'),
      observedPresignedUrl,
    ]) {
      if (secret) expect(logs).not.toContain(secret);
    }
    expect(logs).not.toContain('X-Amz-Signature');
  });
});

async function expectClientStorageToBeEmpty(page: Page): Promise<void> {
  expect(
    await page.evaluate(() => ({
      localStorageKeys: Object.keys(localStorage),
      sessionStorageKeys: Object.keys(sessionStorage),
    })),
  ).toEqual({ localStorageKeys: [], sessionStorageKeys: [] });
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Required E2E environment is missing: ${name}`);
  return value;
}
