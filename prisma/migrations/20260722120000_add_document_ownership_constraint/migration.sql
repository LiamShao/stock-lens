-- Refuse to add the ownership constraint if legacy data is inconsistent.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Document" AS document
    JOIN "Analysis" AS analysis ON analysis."id" = document."analysisId"
    WHERE document."ownerId" <> analysis."ownerId"
  ) THEN
    RAISE EXCEPTION 'Document ownerId does not match Analysis ownerId';
  END IF;
END $$;

-- Composite candidate key used by owner-consistent child relations.
CREATE UNIQUE INDEX "Analysis_ownerId_id_key" ON "Analysis"("ownerId", "id");

-- Replace the ID-only relation with an owner-consistent relation.
ALTER TABLE "Document" DROP CONSTRAINT "Document_analysisId_fkey";
ALTER TABLE "Document"
ADD CONSTRAINT "Document_ownerId_analysisId_fkey"
FOREIGN KEY ("ownerId", "analysisId")
REFERENCES "Analysis"("ownerId", "id")
ON DELETE RESTRICT
ON UPDATE CASCADE;
