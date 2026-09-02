import { AnalysisIntakeScreen } from './analysis-intake-screen';

export default async function AnalysisIntakePage({
  params,
}: {
  params: Promise<{ analysisId: string }>;
}) {
  const { analysisId } = await params;
  return <AnalysisIntakeScreen analysisId={analysisId} />;
}
