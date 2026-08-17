-- EXTRACT-FR-004 / EXTRACT-FR-013: immutable prompt activation and owner-safe usage audit.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "JobExecution" job
    JOIN "Analysis" analysis ON analysis."id" = job."analysisId"
    WHERE analysis."ownerId" <> job."ownerId"
  ) THEN
    RAISE EXCEPTION 'JobExecution owner/analysis lineage is inconsistent';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "AiUsageLog" usage
    JOIN "Analysis" analysis ON analysis."id" = usage."analysisId"
    WHERE usage."analysisId" IS NOT NULL
      AND analysis."ownerId" <> usage."ownerId"
  ) THEN
    RAISE EXCEPTION 'AiUsageLog owner/analysis lineage is inconsistent';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "AiUsageLog" usage
    JOIN "JobExecution" job ON job."id" = usage."jobExecutionId"
    WHERE usage."jobExecutionId" IS NOT NULL
      AND (
        usage."analysisId" IS NULL
        OR job."ownerId" <> usage."ownerId"
        OR job."analysisId" <> usage."analysisId"
      )
  ) THEN
    RAISE EXCEPTION 'AiUsageLog owner/analysis/job lineage is inconsistent';
  END IF;
END $$;

CREATE UNIQUE INDEX "JobExecution_ownerId_analysisId_id_key"
ON "JobExecution"("ownerId", "analysisId", "id");

ALTER TABLE "JobExecution"
DROP CONSTRAINT "JobExecution_analysisId_fkey";

ALTER TABLE "JobExecution"
ADD CONSTRAINT "JobExecution_ownerId_analysisId_fkey"
FOREIGN KEY ("ownerId", "analysisId")
REFERENCES "Analysis"("ownerId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AiUsageLog"
DROP CONSTRAINT "AiUsageLog_analysisId_fkey",
DROP CONSTRAINT "AiUsageLog_jobExecutionId_fkey";

ALTER TABLE "AiUsageLog"
ADD CONSTRAINT "AiUsageLog_ownerId_analysisId_fkey"
FOREIGN KEY ("ownerId", "analysisId")
REFERENCES "Analysis"("ownerId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AiUsageLog"
ADD CONSTRAINT "AiUsageLog_ownerId_analysisId_jobExecutionId_fkey"
FOREIGN KEY ("ownerId", "analysisId", "jobExecutionId")
REFERENCES "JobExecution"("ownerId", "analysisId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PromptVersion"
ADD CONSTRAINT "PromptVersion_identity_check"
CHECK (
  "name" ~ '^[a-z][a-z0-9-]{0,63}$'
  AND "version" > 0
  AND "schemaVersion" ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$'
  AND "contentSha256" ~ '^[0-9a-f]{64}$'
  AND char_length("template") BETWEEN 1 AND 50000
);

CREATE UNIQUE INDEX "PromptVersion_one_active_name_key"
ON "PromptVersion"("name")
WHERE "isActive" = true;

CREATE OR REPLACE FUNCTION reject_prompt_version_content_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."name" IS DISTINCT FROM OLD."name"
    OR NEW."version" IS DISTINCT FROM OLD."version"
    OR NEW."template" IS DISTINCT FROM OLD."template"
    OR NEW."schemaVersion" IS DISTINCT FROM OLD."schemaVersion"
    OR NEW."contentSha256" IS DISTINCT FROM OLD."contentSha256"
  THEN
    RAISE EXCEPTION 'PromptVersion immutable content cannot be updated';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "PromptVersion_reject_content_update"
BEFORE UPDATE ON "PromptVersion"
FOR EACH ROW
EXECUTE FUNCTION reject_prompt_version_content_update();

ALTER TABLE "AiUsageLog"
ADD CONSTRAINT "AiUsageLog_audit_shape_check"
CHECK (
  char_length("provider") BETWEEN 1 AND 64
  AND char_length("model") BETWEEN 1 AND 128
  AND ("requestId" IS NULL OR char_length("requestId") BETWEEN 1 AND 128)
  AND ("providerRequestId" IS NULL OR char_length("providerRequestId") BETWEEN 1 AND 128)
  AND ("jobExecutionId" IS NULL OR "analysisId" IS NOT NULL)
  AND ("operation" <> 'STRUCTURED_GENERATION' OR "promptVersionId" IS NOT NULL)
);
