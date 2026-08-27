import {
  analysisViewsGenerationOutputSchema,
  type AnalysisViewsGenerationOutput,
} from '@stocklens/shared';

import type { AnalysisViewsSource } from './ai/analysis-views-orchestrator';

export class AnalysisViewsCitationError extends Error {
  readonly code = 'VIEW_CITATION_EVIDENCE_INVALID';
  readonly retryable = false;

  constructor() {
    super('Analysis view citation evidence is unavailable.');
    this.name = 'AnalysisViewsCitationError';
  }
}

/**
 * Accepts only direct Evidence IDs that were resolved through an active,
 * owner-scoped FindingEvidence lineage for the exact provider input.
 */
export function validateAnalysisViewsCitations(
  output: AnalysisViewsGenerationOutput,
  source: AnalysisViewsSource,
): AnalysisViewsGenerationOutput {
  const parsed = analysisViewsGenerationOutputSchema.parse(output);
  const allowedEvidenceIds = new Set(
    source.findings.flatMap((finding) =>
      finding.evidences.map((evidence) => evidence.id),
    ),
  );

  for (const view of [
    parsed.justTellMe,
    parsed.analystView,
    parsed.buffettMunger,
  ]) {
    for (const section of view.sections) {
      for (const block of section.blocks) {
        if (
          block.evidenceIds.some(
            (evidenceId) => !allowedEvidenceIds.has(evidenceId),
          )
        ) {
          throw new AnalysisViewsCitationError();
        }
      }
    }
  }

  return parsed;
}
