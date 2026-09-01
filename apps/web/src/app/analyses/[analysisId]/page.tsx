import { AnalysisDetailScreen } from './analysis-detail-screen';

export default async function AnalysisDetailPage({
  params,
}: {
  params: Promise<{ analysisId: string }>;
}) {
  const { analysisId } = await params;
  return <AnalysisDetailScreen analysisId={analysisId} />;
}
