ALTER TYPE "AnalysisStatus" ADD VALUE 'READY_FOR_EMBEDDING' AFTER 'CHUNKING';

CREATE UNIQUE INDEX "Document_ownerId_id_key"
ON "Document"("ownerId", "id");

ALTER TABLE "DocumentPage"
DROP CONSTRAINT "DocumentPage_documentId_fkey";

ALTER TABLE "DocumentPage"
ADD CONSTRAINT "DocumentPage_ownerId_documentId_fkey"
FOREIGN KEY ("ownerId", "documentId")
REFERENCES "Document"("ownerId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DocumentChunk"
DROP CONSTRAINT "DocumentChunk_documentId_fkey";

ALTER TABLE "DocumentChunk"
ADD CONSTRAINT "DocumentChunk_ownerId_documentId_fkey"
FOREIGN KEY ("ownerId", "documentId")
REFERENCES "Document"("ownerId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "JobOperationAudit" (
  "id" UUID NOT NULL,
  "jobExecutionId" UUID NOT NULL,
  "operatorId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "previousStatus" "JobStatus" NOT NULL,
  "status" "JobStatus" NOT NULL,
  "requestId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "JobOperationAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "JobOperationAudit_jobExecutionId_createdAt_idx"
ON "JobOperationAudit"("jobExecutionId", "createdAt");

CREATE INDEX "JobOperationAudit_operatorId_createdAt_idx"
ON "JobOperationAudit"("operatorId", "createdAt");

ALTER TABLE "JobOperationAudit"
ADD CONSTRAINT "JobOperationAudit_jobExecutionId_fkey"
FOREIGN KEY ("jobExecutionId") REFERENCES "JobExecution"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
