import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const specsRoot = join(repositoryRoot, 'specs');
const featuresRoot = join(specsRoot, 'features');
const errors = [];
const declaredRequirementOwners = new Map();
const traceability = readRequired(join(specsRoot, 'traceability.md'));

for (const requiredPath of [
  'README.md',
  'decision-request.md',
  'deviations.md',
  'traceability.md',
  'templates/feature-spec.md',
  'templates/technical-plan.md',
  'templates/tasks.md',
  'templates/verification.md',
]) {
  requirePath(join(specsRoot, requiredPath));
}

for (const featureName of readdirSync(featuresRoot).sort()) {
  const featureRoot = join(featuresRoot, featureName);
  const specPath = join(featureRoot, 'spec.md');
  if (!existsSync(specPath)) {
    errors.push(`${featureName}: spec.md is missing.`);
    continue;
  }

  const spec = readFileSync(specPath, 'utf8');
  for (const section of [
    '## Metadata',
    '## Goal',
    '## Non-goals',
    '## Acceptance Criteria',
    '## Open Questions',
  ]) {
    if (!spec.includes(section)) {
      errors.push(`${featureName}: ${section} is missing from spec.md.`);
    }
  }

  const status = spec.match(/\| Spec status\s+\| `([^`]+)`\s+\|/)?.[1];
  if (!status) {
    errors.push(`${featureName}: Spec status is missing.`);
  }

  if (status !== 'Draft') {
    for (const artifact of [
      'technical-plan.md',
      'tasks.md',
      'verification.md',
    ]) {
      requirePath(join(featureRoot, artifact));
    }
  }

  const requirements = uniqueMatches(spec, /`([A-Z]+-(?:FR|SEC)-\d{3})`/g);
  const acceptanceCriteria = uniqueMatches(spec, /`([A-Z]+-AC-\d{3})`/g);
  for (const requirement of requirements) {
    const previousOwner = declaredRequirementOwners.get(requirement);
    if (previousOwner && previousOwner !== featureName) {
      errors.push(
        `${requirement}: declared by both ${previousOwner} and ${featureName}.`,
      );
    }
    declaredRequirementOwners.set(requirement, featureName);
    if (status !== 'Draft' && !traceability.includes(`\`${requirement}\``)) {
      errors.push(
        `${featureName}: ${requirement} is missing from traceability.md.`,
      );
    }
  }

  if (status !== 'Draft') {
    const verification = readRequired(join(featureRoot, 'verification.md'));
    for (const acceptanceCriterion of acceptanceCriteria) {
      if (!verification.includes(`\`${acceptanceCriterion}\``)) {
        errors.push(
          `${featureName}: ${acceptanceCriterion} is missing from verification.md.`,
        );
      }
    }
  }
}

if (errors.length > 0) {
  process.stderr.write(
    `${JSON.stringify({ errors, event: 'spec_check_failed' }, null, 2)}\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write(
    `${JSON.stringify({
      event: 'spec_check_passed',
      features: readdirSync(featuresRoot).length,
      requirements: declaredRequirementOwners.size,
    })}\n`,
  );
}

function readRequired(path) {
  requirePath(path);
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function requirePath(path) {
  if (!existsSync(path)) {
    errors.push(`${path.slice(repositoryRoot.length + 1)} is missing.`);
  }
}

function uniqueMatches(value, pattern) {
  return [...new Set([...value.matchAll(pattern)].map((match) => match[1]))];
}
