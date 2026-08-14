import { analysisResourceSchema, analysisStatusSchema } from './analysis';

describe('analysis status contract', () => {
  it('EXTRACT-FR-012 exposes READY_FOR_VIEW_GENERATION as a stable handoff status', () => {
    expect(analysisStatusSchema.parse('READY_FOR_VIEW_GENERATION')).toBe(
      'READY_FOR_VIEW_GENERATION',
    );
    expect(
      analysisResourceSchema.parse({
        companyId: null,
        completedAt: null,
        createdAt: '2026-08-14T00:00:00.000Z',
        failureCode: null,
        failureMessage: null,
        id: 'd0f984a5-2e5e-4ead-876b-30e078eec501',
        status: 'READY_FOR_VIEW_GENERATION',
        title: 'Validated findings',
        updatedAt: '2026-08-14T00:00:00.000Z',
      }),
    ).toMatchObject({
      completedAt: null,
      status: 'READY_FOR_VIEW_GENERATION',
    });
  });
});
