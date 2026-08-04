ALTER TABLE "JobExecution"
ADD COLUMN "documentUploadId" UUID;

CREATE INDEX "JobExecution_documentUploadId_idx"
ON "JobExecution"("documentUploadId");

CREATE UNIQUE INDEX "DocumentUpload_ownerId_analysisId_id_key"
ON "DocumentUpload"("ownerId", "analysisId", "id");

ALTER TABLE "JobExecution"
DROP CONSTRAINT "JobExecution_documentId_fkey";

ALTER TABLE "JobExecution"
ADD CONSTRAINT "JobExecution_documentId_fkey"
FOREIGN KEY ("ownerId", "analysisId", "documentId")
REFERENCES "Document"("ownerId", "analysisId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "JobExecution"
ADD CONSTRAINT "JobExecution_documentUploadId_fkey"
FOREIGN KEY ("ownerId", "analysisId", "documentUploadId")
REFERENCES "DocumentUpload"("ownerId", "analysisId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "JobExecution"
ADD CONSTRAINT "JobExecution_objectCleanupTarget_check"
CHECK (
  "step" <> 'OBJECT_CLEANUP'
  OR (("documentId" IS NOT NULL)::integer + ("documentUploadId" IS NOT NULL)::integer = 1)
);
