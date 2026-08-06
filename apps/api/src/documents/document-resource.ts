import type { DocumentResource } from '@stocklens/shared';

export interface DocumentResourceRecord {
  analysisId: string;
  createdAt: Date;
  documentType: DocumentResource['documentType'];
  id: string;
  mimeType: string;
  originalName: string;
  sha256: string;
  sizeBytes: bigint;
  updatedAt: Date;
  uploadedAt: Date | null;
}

export function toDocumentResource(
  document: DocumentResourceRecord,
): DocumentResource {
  if (document.uploadedAt === null) {
    throw new Error('Finalized document is missing uploadedAt.');
  }
  if (document.mimeType !== 'application/pdf') {
    throw new Error('Finalized document has an invalid MIME type.');
  }
  return {
    analysisId: document.analysisId,
    createdAt: document.createdAt.toISOString(),
    documentType: document.documentType,
    id: document.id,
    mimeType: document.mimeType,
    originalName: document.originalName,
    sha256: document.sha256,
    sizeBytes: Number(document.sizeBytes),
    updatedAt: document.updatedAt.toISOString(),
    uploadedAt: document.uploadedAt.toISOString(),
  };
}
