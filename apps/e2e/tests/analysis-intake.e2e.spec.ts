import { readFile } from 'node:fs/promises';

import { PrismaClient } from '@prisma/client';
import {
  apiErrorResponseSchema,
  authResponseSchema,
  documentResourceSchema,
} from '@stocklens/shared';
import { expect, test } from '@playwright/test';

import {
  E2E_API_ORIGIN,
  E2E_INTAKE_OWNER,
  E2E_OWNER_B,
} from '../support/constants';
import { createSyntheticPdf } from '../support/synthetic-pdf';

const ANALYSIS_TITLE = 'INTAKE 実経路分析';
const DOCUMENT_NAME = 'intake-real-upload.pdf';
let analysisId: string;
let documentId: string;

test.describe.serial('INTAKE-AC-012..013 full browser journey', () => {
  test('registers, uploads a real PDF, explicitly starts processing, and reaches all three views', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ height: 844, width: 390 });
    let processRequests = 0;
    page.on('request', (request) => {
      if (
        request.method() === 'POST' &&
        request.url().endsWith('/process')
      ) {
        processRequests += 1;
      }
    });

    await page.goto('/register');
    await page.getByLabel('表示名（任意）').fill(E2E_INTAKE_OWNER.displayName);
    await page.getByLabel('メールアドレス').fill(E2E_INTAKE_OWNER.email);
    await page.getByLabel('パスワード').fill(E2E_INTAKE_OWNER.password);
    await page.getByRole('button', { name: 'アカウントを作成' }).click();
    await expect(page).toHaveURL(/\/analyses$/);

    await page.getByRole('link', { name: '新しい分析' }).click();
    await page.getByLabel('分析名').fill(ANALYSIS_TITLE);
    await page.getByRole('button', { name: 'PDF追加へ進む' }).click();
    await expect(page).toHaveURL(/\/analyses\/[^/]+\/intake$/);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    analysisId = new URL(page.url()).pathname.split('/')[2] ?? '';
    expect(analysisId).not.toBe('');

    const finalizeResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().endsWith('/finalize'),
    );
    await page.locator('input[type="file"]').setInputFiles({
      buffer: Buffer.from(createSyntheticPdf(3)),
      mimeType: 'application/pdf',
      name: DOCUMENT_NAME,
    });
    await expect(
      page.getByRole('button', { name: '選択したPDF 1件をアップロード' }),
    ).toBeVisible();
    expect(processRequests).toBe(0);
    await page
      .getByRole('button', { name: '選択したPDF 1件をアップロード' })
      .click();

    const finalizeResponse = await finalizeResponsePromise;
    expect(finalizeResponse.status()).toBe(200);
    const finalizedDocument = documentResourceSchema.parse(
      await finalizeResponse.json(),
    );
    documentId = finalizedDocument.id;
    await expect(
      page.getByText(DOCUMENT_NAME, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'このPDFで分析を開始' }),
    ).toBeEnabled();
    expect(processRequests).toBe(0);

    await page
      .getByRole('button', { name: 'このPDFで分析を開始' })
      .click();
    await expect(page).toHaveURL(new RegExp(`/analyses/${analysisId}$`));
    try {
      await expect(page.getByText('完了', { exact: true })).toBeVisible({
        timeout: 30_000,
      });
    } catch (error) {
      const workerLogPath = process.env.STOCKLENS_E2E_WORKER_LOG_PATH;
      const workerLog = workerLogPath
        ? await readFile(workerLogPath, 'utf8')
        : 'Worker log path unavailable.';
      const databaseUrl = process.env.STOCKLENS_E2E_DATABASE_URL;
      const diagnostics = databaseUrl
        ? await readAnalysisDiagnostics(databaseUrl, analysisId)
        : 'Database URL unavailable.';
      throw new Error(
        `Analysis did not complete. Worker log:\n${workerLog}\nState:\n${diagnostics}`,
        { cause: error },
      );
    }
    expect(processRequests).toBe(1);
    await expect(page.getByRole('tab', { name: 'Just Tell Me' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Analyst View' })).toBeVisible();
    await expect(
      page.getByRole('tab', { name: 'Buffett-Munger Lens' }),
    ).toBeVisible();
    await page.getByRole('button', { name: /根拠 1を開く/ }).first().click();
    await expect(page.getByRole('dialog', { name: '根拠を確認' })).toContainText(
      DOCUMENT_NAME,
    );
  });

  test('owner B receives the same 404 boundary for intake mutations and reads', async ({
    request,
  }) => {
    expect(analysisId).not.toBe('');
    expect(documentId).not.toBe('');
    const loginResponse = await request.post(
      `${E2E_API_ORIGIN}/api/auth/login`,
      { data: { email: E2E_OWNER_B.email, password: E2E_OWNER_B.password } },
    );
    const auth = authResponseSchema.parse(await loginResponse.json());
    const headers = { authorization: `Bearer ${auth.accessToken}` };
    const responses = await Promise.all([
      request.get(
        `${E2E_API_ORIGIN}/api/analyses/${analysisId}/documents`,
        { headers },
      ),
      request.post(
        `${E2E_API_ORIGIN}/api/analyses/${analysisId}/document-uploads`,
        {
          data: {
            documentType: 'UNKNOWN',
            mimeType: 'application/pdf',
            originalName: 'foreign.pdf',
            sha256: 'a'.repeat(64),
            sizeBytes: 1024,
          },
          headers,
        },
      ),
      request.delete(
        `${E2E_API_ORIGIN}/api/analyses/${analysisId}/documents/${documentId}`,
        { headers },
      ),
      request.post(`${E2E_API_ORIGIN}/api/analyses/${analysisId}/process`, {
        headers,
      }),
    ]);

    for (const response of responses) {
      expect(response.status()).toBe(404);
      const error = apiErrorResponseSchema.parse(await response.json());
      expect(error.code).toBe('ANALYSIS_NOT_FOUND');
      expect(JSON.stringify(error)).not.toContain(ANALYSIS_TITLE);
      expect(JSON.stringify(error)).not.toContain(DOCUMENT_NAME);
    }
  });
});

async function readAnalysisDiagnostics(
  databaseUrl: string,
  id: string,
): Promise<string> {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const [analysis, jobs] = await Promise.all([
      prisma.analysis.findUnique({
        select: { failureCode: true, status: true },
        where: { id },
      }),
      prisma.jobExecution.findMany({
        orderBy: { createdAt: 'asc' },
        select: { errorCode: true, status: true, step: true },
        where: { analysisId: id },
      }),
    ]);
    return JSON.stringify({ analysis, jobs });
  } finally {
    await prisma.$disconnect();
  }
}
