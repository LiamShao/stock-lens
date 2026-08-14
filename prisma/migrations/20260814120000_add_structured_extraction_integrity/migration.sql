ALTER TYPE "AnalysisStatus"
ADD VALUE 'READY_FOR_VIEW_GENERATION' AFTER 'VALIDATING';

ALTER TABLE "FindingEvidence"
ADD COLUMN "analysisId" UUID;

UPDATE "FindingEvidence" AS link
SET "analysisId" = finding."analysisId"
FROM "AnalysisFinding" AS finding
WHERE finding."id" = link."findingId";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "AnalysisFinding" AS finding
    JOIN "Analysis" AS analysis ON analysis."id" = finding."analysisId"
    WHERE finding."ownerId" <> analysis."ownerId"
  ) THEN
    RAISE EXCEPTION 'AnalysisFinding ownership mismatch blocks structured extraction migration.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Evidence" AS evidence
    JOIN "Analysis" AS analysis ON analysis."id" = evidence."analysisId"
    JOIN "Document" AS document ON document."id" = evidence."documentId"
    JOIN "DocumentPage" AS page ON page."id" = evidence."pageId"
    JOIN "DocumentChunk" AS chunk ON chunk."id" = evidence."chunkId"
    WHERE evidence."ownerId" <> analysis."ownerId"
       OR evidence."ownerId" <> document."ownerId"
       OR evidence."analysisId" <> document."analysisId"
       OR evidence."ownerId" <> page."ownerId"
       OR evidence."documentId" <> page."documentId"
       OR evidence."ownerId" <> chunk."ownerId"
       OR evidence."documentId" <> chunk."documentId"
       OR evidence."pageId" <> chunk."pageId"
  ) THEN
    RAISE EXCEPTION 'Evidence lineage mismatch blocks structured extraction migration.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "FindingEvidence" AS link
    JOIN "AnalysisFinding" AS finding ON finding."id" = link."findingId"
    JOIN "Evidence" AS evidence ON evidence."id" = link."evidenceId"
    WHERE link."analysisId" IS NULL
       OR link."ownerId" <> finding."ownerId"
       OR link."analysisId" <> finding."analysisId"
       OR link."ownerId" <> evidence."ownerId"
       OR link."analysisId" <> evidence."analysisId"
  ) THEN
    RAISE EXCEPTION 'FindingEvidence ownership mismatch blocks structured extraction migration.';
  END IF;
END $$;

ALTER TABLE "FindingEvidence"
ALTER COLUMN "analysisId" SET NOT NULL;

ALTER TABLE "AnalysisFinding"
ADD CONSTRAINT "AnalysisFinding_importance_check"
CHECK ("importance" BETWEEN 1 AND 5);

CREATE UNIQUE INDEX "DocumentPage_ownerId_documentId_id_key"
ON "DocumentPage"("ownerId", "documentId", "id");

CREATE UNIQUE INDEX "DocumentChunk_ownerId_documentId_pageId_id_key"
ON "DocumentChunk"("ownerId", "documentId", "pageId", "id");

CREATE UNIQUE INDEX "AnalysisFinding_ownerId_analysisId_id_key"
ON "AnalysisFinding"("ownerId", "analysisId", "id");

CREATE UNIQUE INDEX "Evidence_ownerId_analysisId_id_key"
ON "Evidence"("ownerId", "analysisId", "id");

CREATE INDEX "FindingEvidence_ownerId_analysisId_findingId_idx"
ON "FindingEvidence"("ownerId", "analysisId", "findingId");

DROP INDEX "FindingEvidence_ownerId_findingId_idx";

ALTER TABLE "DocumentChunk"
DROP CONSTRAINT "DocumentChunk_pageId_fkey";

ALTER TABLE "DocumentChunk"
ADD CONSTRAINT "DocumentChunk_ownerId_documentId_pageId_fkey"
FOREIGN KEY ("ownerId", "documentId", "pageId")
REFERENCES "DocumentPage"("ownerId", "documentId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AnalysisFinding"
DROP CONSTRAINT "AnalysisFinding_analysisId_fkey";

ALTER TABLE "AnalysisFinding"
ADD CONSTRAINT "AnalysisFinding_ownerId_analysisId_fkey"
FOREIGN KEY ("ownerId", "analysisId")
REFERENCES "Analysis"("ownerId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Evidence"
DROP CONSTRAINT "Evidence_analysisId_fkey",
DROP CONSTRAINT "Evidence_documentId_fkey",
DROP CONSTRAINT "Evidence_pageId_fkey",
DROP CONSTRAINT "Evidence_chunkId_fkey";

ALTER TABLE "Evidence"
ADD CONSTRAINT "Evidence_ownerId_analysisId_fkey"
FOREIGN KEY ("ownerId", "analysisId")
REFERENCES "Analysis"("ownerId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "Evidence_ownerId_analysisId_documentId_fkey"
FOREIGN KEY ("ownerId", "analysisId", "documentId")
REFERENCES "Document"("ownerId", "analysisId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "Evidence_ownerId_documentId_pageId_fkey"
FOREIGN KEY ("ownerId", "documentId", "pageId")
REFERENCES "DocumentPage"("ownerId", "documentId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "Evidence_ownerId_documentId_pageId_chunkId_fkey"
FOREIGN KEY ("ownerId", "documentId", "pageId", "chunkId")
REFERENCES "DocumentChunk"("ownerId", "documentId", "pageId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FindingEvidence"
DROP CONSTRAINT "FindingEvidence_findingId_fkey",
DROP CONSTRAINT "FindingEvidence_evidenceId_fkey";

ALTER TABLE "FindingEvidence"
ADD CONSTRAINT "FindingEvidence_ownerId_analysisId_findingId_fkey"
FOREIGN KEY ("ownerId", "analysisId", "findingId")
REFERENCES "AnalysisFinding"("ownerId", "analysisId", "id")
ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "FindingEvidence_ownerId_analysisId_evidenceId_fkey"
FOREIGN KEY ("ownerId", "analysisId", "evidenceId")
REFERENCES "Evidence"("ownerId", "analysisId", "id")
ON DELETE CASCADE ON UPDATE CASCADE;
