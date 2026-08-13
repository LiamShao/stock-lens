import { getJobOperatorConfig } from './job-operation.config';

describe('getJobOperatorConfig', () => {
  it('RERUN-AC-006 fails closed unless explicitly enabled', () => {
    expect(() => getJobOperatorConfig({ NODE_ENV: 'production' })).toThrow(
      'JOB_RERUN_DISABLED',
    );
  });

  it('RERUN-SEC-001 accepts an explicit non-default secret', () => {
    expect(
      getJobOperatorConfig({
        ALLOW_JOB_RERUN: 'true',
        JOB_OPERATOR_SECRET: 'x'.repeat(32),
        NODE_ENV: 'production',
      }),
    ).toMatchObject({ enabled: true, production: true });
  });
});
