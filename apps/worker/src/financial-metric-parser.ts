import {
  FINANCIAL_METRIC_KEYS,
  FINANCIAL_METRIC_SNAPSHOT_SCHEMA_VERSION,
  financialMetricSnapshotSchema,
  type FinancialMetricKey,
  type FinancialMetricObservation,
  type FinancialMetricPeriod,
  type FinancialMetricResult,
  type FinancialMetricSnapshot,
  type FinancialMetricUnknownReason,
} from '@stocklens/shared';

export interface FinancialMetricChunkInput {
  readonly chunkId: string;
  readonly content: string;
  readonly documentId: string;
  readonly documentName: string;
  readonly pageNumber: number;
}

interface MetricDefinition {
  readonly key: FinancialMetricKey;
  readonly labels: readonly string[];
  readonly lossLabels: readonly string[];
}

interface UnitDefinition {
  readonly multiplier: bigint;
  readonly rawUnit: string;
  readonly unit: 'JPY' | 'THOUSAND_JPY' | 'MILLION_JPY' | 'HUNDRED_MILLION_JPY';
}

interface ParsedContext {
  readonly periods:
    readonly [FinancialMetricPeriod, FinancialMetricPeriod] | null;
  readonly scope: 'CONSOLIDATED' | 'NON_CONSOLIDATED' | null;
  readonly unit: UnitDefinition | null;
  readonly unknownReasons: readonly FinancialMetricUnknownReason[];
}

interface ObservationPair {
  readonly current: FinancialMetricObservation;
  readonly previous: FinancialMetricObservation;
}

const METRIC_DEFINITIONS: readonly MetricDefinition[] = [
  {
    key: 'REVENUE',
    labels: ['売上収益', '営業収益', '売上高'],
    lossLabels: [],
  },
  {
    key: 'OPERATING_PROFIT',
    labels: ['営業利益', '営業損失'],
    lossLabels: ['営業損失'],
  },
  {
    key: 'NET_INCOME',
    labels: [
      '親会社株主に帰属する当期純利益',
      '親会社株主に帰属する四半期純利益',
      '親会社株主に帰属する中間純利益',
      '親会社株主に帰属する当期純損失',
      '親会社株主に帰属する四半期純損失',
      '親会社株主に帰属する中間純損失',
      '四半期純利益',
      '四半期純損失',
      '中間純利益',
      '中間純損失',
      '当期純利益',
      '当期純損失',
    ],
    lossLabels: [
      '親会社株主に帰属する当期純損失',
      '親会社株主に帰属する四半期純損失',
      '親会社株主に帰属する中間純損失',
      '四半期純損失',
      '中間純損失',
      '当期純損失',
    ],
  },
  {
    key: 'OPERATING_CASH_FLOW',
    labels: [
      '営業活動によるキャッシュ・フロー',
      '営業活動によるキャッシュフロー',
    ],
    lossLabels: [],
  },
];

const UNIT_BY_LABEL: Readonly<Record<string, UnitDefinition>> = {
  円: { multiplier: 1n, rawUnit: '円', unit: 'JPY' },
  千円: { multiplier: 1_000n, rawUnit: '千円', unit: 'THOUSAND_JPY' },
  百万円: {
    multiplier: 1_000_000n,
    rawUnit: '百万円',
    unit: 'MILLION_JPY',
  },
  億円: {
    multiplier: 100_000_000n,
    rawUnit: '億円',
    unit: 'HUNDRED_MILLION_JPY',
  },
};

const UNKNOWN_REASON_ORDER: readonly FinancialMetricUnknownReason[] = [
  'MISSING_VALUE',
  'AMBIGUOUS_LABEL',
  'AMBIGUOUS_UNIT',
  'AMBIGUOUS_PERIOD',
  'AMBIGUOUS_SCOPE',
  'AMBIGUOUS_SIGN',
  'CONFLICTING_VALUES',
  'ZERO_PREVIOUS_VALUE',
];

/**
 * Extracts the deliberately small P0 metric set without statistical or LLM
 * inference. A value is published only when label, unit, period, scope and sign
 * are deterministic inside the source chunk.
 */
export function extractFinancialMetricSnapshot(
  chunks: readonly FinancialMetricChunkInput[],
): FinancialMetricSnapshot {
  const pairs = new Map<FinancialMetricKey, ObservationPair[]>();
  const reasons = new Map<FinancialMetricKey, FinancialMetricUnknownReason[]>();
  for (const key of FINANCIAL_METRIC_KEYS) {
    pairs.set(key, []);
    reasons.set(key, []);
  }

  for (const chunk of chunks) {
    parseChunk(chunk, pairs, reasons);
  }

  const metrics = FINANCIAL_METRIC_KEYS.map((metric) =>
    buildMetricResult(
      metric,
      pairs.get(metric) ?? [],
      reasons.get(metric) ?? [],
    ),
  );
  return financialMetricSnapshotSchema.parse({
    metrics,
    schemaVersion: FINANCIAL_METRIC_SNAPSHOT_SCHEMA_VERSION,
  });
}

function parseChunk(
  chunk: FinancialMetricChunkInput,
  pairs: Map<FinancialMetricKey, ObservationPair[]>,
  reasons: Map<FinancialMetricKey, FinancialMetricUnknownReason[]>,
): void {
  const normalizedContent = normalizeText(chunk.content);
  const context = parseContext(normalizedContent);
  const originalLines = chunk.content.split(/\r?\n/u);

  for (const originalLine of originalLines) {
    const line = normalizeText(originalLine).trim();
    if (line === '') continue;
    const match = matchMetricDefinition(line);
    if (match === null) {
      const ambiguousMetric = matchAmbiguousMetricLabel(line);
      if (ambiguousMetric !== null) {
        reasons.get(ambiguousMetric)?.push('AMBIGUOUS_LABEL');
      }
      continue;
    }

    if (context.unknownReasons.length > 0) {
      reasons.get(match.definition.key)?.push(...context.unknownReasons);
      continue;
    }
    if (
      context.periods === null ||
      context.scope === null ||
      context.unit === null
    ) {
      continue;
    }

    const valueText = line.slice(match.label.length).trim();
    if (hasAmbiguousSign(valueText)) {
      reasons.get(match.definition.key)?.push('AMBIGUOUS_SIGN');
      continue;
    }
    const rawValues = extractMonetaryTokens(valueText);
    if (rawValues.length !== 2) {
      reasons.get(match.definition.key)?.push('MISSING_VALUE');
      continue;
    }
    const lossLabel = match.definition.lossLabels.includes(match.label);
    const normalizedValues = rawValues.map((rawValue) =>
      normalizeMonetaryValue(rawValue, context.unit!, lossLabel),
    );
    if (normalizedValues.some((value) => value === null)) {
      reasons.get(match.definition.key)?.push('AMBIGUOUS_SIGN');
      continue;
    }

    const observations = context.periods.map((period, index) =>
      buildObservation({
        chunk,
        normalizedValueYen: normalizedValues[index]!,
        originalLine,
        period,
        rawValue: rawValues[index]!,
        scope: context.scope!,
        unit: context.unit!,
      }),
    ) as [FinancialMetricObservation, FinancialMetricObservation];
    const [first, second] = observations;
    const pair =
      comparePeriods(first.period, second.period) > 0
        ? { current: first, previous: second }
        : { current: second, previous: first };
    pairs.get(match.definition.key)?.push(pair);
  }
}

function parseContext(content: string): ParsedContext {
  const unknownReasons: FinancialMetricUnknownReason[] = [];
  const unitLabels = uniqueMatches(
    content,
    /単位\s*[:：]\s*(千円|百万円|億円|円)/gu,
  );
  const unit = unitLabels.length === 1 ? UNIT_BY_LABEL[unitLabels[0]!]! : null;
  if (unit === null) unknownReasons.push('AMBIGUOUS_UNIT');

  const scopeValues = new Set<'CONSOLIDATED' | 'NON_CONSOLIDATED'>();
  if (/(?:非連結|個別|単体)/u.test(content))
    scopeValues.add('NON_CONSOLIDATED');
  const withoutNonConsolidated = content.replace(/非連結/gu, '');
  if (/連結/u.test(withoutNonConsolidated)) scopeValues.add('CONSOLIDATED');
  const scope = scopeValues.size === 1 ? [...scopeValues][0]! : null;
  if (scope === null) unknownReasons.push('AMBIGUOUS_SCOPE');

  const periods = extractPeriods(content);
  if (periods === null) unknownReasons.push('AMBIGUOUS_PERIOD');
  return { periods, scope, unit, unknownReasons };
}

function extractPeriods(
  content: string,
): readonly [FinancialMetricPeriod, FinancialMetricPeriod] | null {
  const pattern =
    /(\d{4})年(\d{1,2})月期(?:\s*(第[1-3]四半期(?:累計期間)?|中間期|通期))?/gu;
  const periods: FinancialMetricPeriod[] = [];
  const seen = new Set<string>();
  for (const match of content.matchAll(pattern)) {
    const fiscalYear = Number(match[1]);
    const endMonth = Number(match[2]);
    const duration = normalizeDuration(match[3]);
    if (endMonth < 1 || endMonth > 12 || duration === null) return null;
    const normalizedKey = `FY:${fiscalYear}-${String(endMonth).padStart(2, '0')}:${duration}`;
    if (seen.has(normalizedKey)) continue;
    seen.add(normalizedKey);
    periods.push({
      duration,
      endMonth,
      fiscalYear,
      label: match[0],
      normalizedKey,
    });
  }
  if (periods.length !== 2) return null;
  const first = periods[0]!;
  const second = periods[1]!;
  if (
    first.duration !== second.duration ||
    first.endMonth !== second.endMonth ||
    Math.abs(first.fiscalYear - second.fiscalYear) !== 1
  ) {
    return null;
  }
  return [first, second];
}

function normalizeDuration(
  qualifier: string | undefined,
): FinancialMetricPeriod['duration'] | null {
  if (qualifier === undefined || qualifier === '通期') return 'ANNUAL';
  if (qualifier.startsWith('第1四半期')) return 'Q1';
  if (qualifier.startsWith('第2四半期')) return 'Q2';
  if (qualifier.startsWith('第3四半期')) return 'Q3';
  if (qualifier === '中間期') return 'INTERIM';
  return null;
}

function matchMetricDefinition(
  line: string,
): { definition: MetricDefinition; label: string } | null {
  for (const definition of METRIC_DEFINITIONS) {
    for (const label of definition.labels) {
      if (line === label || line.startsWith(`${label} `)) {
        return { definition, label };
      }
    }
  }
  return null;
}

function matchAmbiguousMetricLabel(line: string): FinancialMetricKey | null {
  if (/^純利益(?:\s|$)/u.test(line)) return 'NET_INCOME';
  if (/^キャッシュ[・\s-]?フロー(?:\s|$)/u.test(line)) {
    return 'OPERATING_CASH_FLOW';
  }
  return null;
}

function extractMonetaryTokens(text: string): string[] {
  const tokens: string[] = [];
  const pattern =
    /(?:[-△▲+]?\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\(\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*\))\s*%?/gu;
  for (const match of text.matchAll(pattern)) {
    const token = match[0].trim();
    if (token.endsWith('%')) continue;
    tokens.push(token);
  }
  return tokens;
}

function hasAmbiguousSign(text: string): boolean {
  return /[△▲]\s*[-+]|[-+]\s*[△▲]/u.test(text);
}

function normalizeMonetaryValue(
  rawValue: string,
  unit: UnitDefinition,
  lossLabel: boolean,
): string | null {
  const compact = rawValue.replace(/\s/gu, '');
  const parenthesized = /^\(.+\)$/u.test(compact);
  const explicitNegative = /^[△▲-]/u.test(compact) || parenthesized;
  const unsigned = compact
    .replace(/^[△▲+-]/u, '')
    .replace(/^\(/u, '')
    .replace(/\)$/u, '')
    .replace(/,/gu, '');
  if (!/^\d+(?:\.\d+)?$/u.test(unsigned)) return null;
  const [integerPart, fractionalPart = ''] = unsigned.split('.');
  const scale = 10n ** BigInt(fractionalPart.length);
  const scaled = BigInt(`${integerPart}${fractionalPart}`) * unit.multiplier;
  if (scaled % scale !== 0n) return null;
  const magnitude = scaled / scale;
  const negative = lossLabel || explicitNegative;
  return (negative ? -magnitude : magnitude).toString();
}

function buildObservation(input: {
  readonly chunk: FinancialMetricChunkInput;
  readonly normalizedValueYen: string;
  readonly originalLine: string;
  readonly period: FinancialMetricPeriod;
  readonly rawValue: string;
  readonly scope: 'CONSOLIDATED' | 'NON_CONSOLIDATED';
  readonly unit: UnitDefinition;
}): FinancialMetricObservation {
  return {
    formula: `${input.rawValue.replace(/\s/gu, '')} × ${input.unit.multiplier.toString()} JPY`,
    normalizedValueYen: input.normalizedValueYen,
    period: input.period,
    rawUnit: input.unit.rawUnit,
    rawValue: input.rawValue,
    scope: input.scope,
    source: {
      chunkId: input.chunk.chunkId,
      documentId: input.chunk.documentId,
      documentName: input.chunk.documentName,
      excerpt: input.originalLine.trim(),
      pageNumber: input.chunk.pageNumber,
    },
    unit: input.unit.unit,
  };
}

function buildMetricResult(
  metric: FinancialMetricKey,
  candidates: readonly ObservationPair[],
  collectedReasons: readonly FinancialMetricUnknownReason[],
): FinancialMetricResult {
  const uniqueCandidates = deduplicateCandidates(candidates);
  if (uniqueCandidates.length === 0) {
    return {
      comparison: null,
      current: null,
      metric,
      previous: null,
      status: 'UNKNOWN',
      unknownReasons: sortReasons(
        collectedReasons.length > 0 ? collectedReasons : ['MISSING_VALUE'],
      ),
    };
  }
  if (uniqueCandidates.length > 1) {
    return {
      comparison: null,
      current: null,
      metric,
      previous: null,
      status: 'UNKNOWN',
      unknownReasons: sortReasons([...collectedReasons, 'CONFLICTING_VALUES']),
    };
  }

  const { current, previous } = uniqueCandidates[0]!;
  const currentValue = BigInt(current.normalizedValueYen);
  const previousValue = BigInt(previous.normalizedValueYen);
  const amountChange = currentValue - previousValue;
  if (previousValue === 0n) {
    return {
      comparison: {
        amountChangeYen: amountChange.toString(),
        amountFormula: `${currentValue.toString()} - ${previousValue.toString()}`,
        rateFormula: null,
        ratePercent: null,
      },
      current,
      metric,
      previous,
      status: 'PARTIAL',
      unknownReasons: ['ZERO_PREVIOUS_VALUE'],
    };
  }
  return {
    comparison: {
      amountChangeYen: amountChange.toString(),
      amountFormula: `${currentValue.toString()} - ${previousValue.toString()}`,
      rateFormula: `(${currentValue.toString()} - ${previousValue.toString()}) / abs(${previousValue.toString()}) × 100`,
      ratePercent: calculateRatePercent(amountChange, previousValue),
    },
    current,
    metric,
    previous,
    status: 'COMPLETE',
    unknownReasons: [],
  };
}

function deduplicateCandidates(
  candidates: readonly ObservationPair[],
): ObservationPair[] {
  const unique = new Map<string, ObservationPair>();
  for (const candidate of candidates) {
    const key = [
      candidate.current.period.normalizedKey,
      candidate.current.normalizedValueYen,
      candidate.previous.period.normalizedKey,
      candidate.previous.normalizedValueYen,
      candidate.current.scope,
      candidate.current.unit,
    ].join('|');
    if (!unique.has(key)) unique.set(key, candidate);
  }
  return [...unique.values()];
}

function calculateRatePercent(change: bigint, previous: bigint): string {
  const denominator = previous < 0n ? -previous : previous;
  const scaledHundredths = divideRounded(change * 10_000n, denominator);
  const negative = scaledHundredths < 0n;
  const absolute = negative ? -scaledHundredths : scaledHundredths;
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, '0');
  const value =
    fraction === '00'
      ? whole.toString()
      : `${whole}.${fraction.replace(/0$/u, '')}`;
  return negative && absolute !== 0n ? `-${value}` : value;
}

function divideRounded(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const quotient = absolute / denominator;
  const remainder = absolute % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

function comparePeriods(
  left: FinancialMetricPeriod,
  right: FinancialMetricPeriod,
): number {
  return left.fiscalYear - right.fiscalYear || left.endMonth - right.endMonth;
}

function uniqueMatches(content: string, pattern: RegExp): string[] {
  return [
    ...new Set(
      [...content.matchAll(pattern)]
        .map((match) => match[1])
        .filter((value): value is string => value !== undefined),
    ),
  ];
}

function sortReasons(
  reasons: readonly FinancialMetricUnknownReason[],
): FinancialMetricUnknownReason[] {
  const values = new Set(reasons);
  return UNKNOWN_REASON_ORDER.filter((reason) => values.has(reason));
}

function normalizeText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[−‐‑‒–—―]/gu, '-')
    .replace(/[\t\u00a0]+/gu, ' ')
    .replace(/ {2,}/gu, ' ');
}
