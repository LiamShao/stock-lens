import type { AnalysisStatus } from '@stocklens/shared';

const STATUS_LABELS: Record<AnalysisStatus, string> = {
  CHUNKING: '文書を分割中',
  COMPLETED: '完了',
  DRAFT: '下書き',
  EMBEDDING: '埋め込み処理中',
  EXTRACTING: '情報を抽出中',
  FAILED_CHUNKING: '文書分割に失敗',
  FAILED_EMBEDDING: '埋め込み処理に失敗',
  FAILED_EXTRACTION: '情報抽出に失敗',
  FAILED_PARSING: 'PDF解析に失敗',
  FAILED_VALIDATION: '検証に失敗',
  PARSING: 'PDFを解析中',
  READY_FOR_EMBEDDING: '埋め込み待ち',
  READY_FOR_VIEW_GENERATION: 'ビュー生成待ち',
  UPLOADED: 'アップロード済み',
  VALIDATING: '内容を検証中',
};

export function statusLabel(status: AnalysisStatus): string {
  return STATUS_LABELS[status];
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
