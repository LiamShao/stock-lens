-- CreateEnum
CREATE TYPE "DocumentUploadStatus" AS ENUM (
    'PENDING',
    'VALIDATING',
    'COMPLETED',
    'REJECTED',
    'EXPIRED'
);

-- Composite candidate key used by the finalized upload relation.
CREATE UNIQUE INDEX "Document_ownerId_analysisId_id_key"
ON "Document"("ownerId", "analysisId", "id");

-- CreateTable
CREATE TABLE "DocumentUpload" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "analysisId" UUID NOT NULL,
    "finalizedDocumentId" UUID,
    "originalName" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL DEFAULT 'UNKNOWN',
    "declaredMimeType" TEXT NOT NULL,
    "declaredSizeBytes" BIGINT NOT NULL,
    "claimedSha256" TEXT NOT NULL,
    "storageBucket" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "status" "DocumentUploadStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DocumentUpload_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DocumentUpload_declaredSizeBytes_check"
        CHECK ("declaredSizeBytes" BETWEEN 1 AND 20971520),
    CONSTRAINT "DocumentUpload_claimedSha256_check"
        CHECK ("claimedSha256" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "DocumentUpload_expiresAt_check"
        CHECK ("expiresAt" > "createdAt"),
    CONSTRAINT "DocumentUpload_requiredMetadata_check"
        CHECK (
            char_length("originalName") > 0
            AND char_length("declaredMimeType") > 0
            AND char_length("storageBucket") > 0
            AND char_length("storageKey") > 0
        ),
    CONSTRAINT "DocumentUpload_completionState_check"
        CHECK (
            (
                "status" = 'COMPLETED'
                AND "finalizedDocumentId" IS NOT NULL
                AND "completedAt" IS NOT NULL
                AND "failureCode" IS NULL
                AND "failureMessage" IS NULL
            )
            OR
            (
                "status" <> 'COMPLETED'
                AND "finalizedDocumentId" IS NULL
                AND "completedAt" IS NULL
            )
        ),
    CONSTRAINT "DocumentUpload_failureState_check"
        CHECK (
            (
                "status" = 'REJECTED'
                AND "failureCode" IS NOT NULL
            )
            OR
            (
                "status" <> 'REJECTED'
                AND "failureCode" IS NULL
                AND "failureMessage" IS NULL
            )
        )
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentUpload_storageKey_key"
ON "DocumentUpload"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentUpload_ownerId_analysisId_finalizedDocumentId_key"
ON "DocumentUpload"("ownerId", "analysisId", "finalizedDocumentId");

-- CreateIndex
CREATE INDEX "DocumentUpload_ownerId_analysisId_status_idx"
ON "DocumentUpload"("ownerId", "analysisId", "status");

-- CreateIndex
CREATE INDEX "DocumentUpload_status_expiresAt_idx"
ON "DocumentUpload"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "DocumentUpload_ownerId_analysisId_claimedSha256_idx"
ON "DocumentUpload"("ownerId", "analysisId", "claimedSha256");

-- AddForeignKey
ALTER TABLE "DocumentUpload"
ADD CONSTRAINT "DocumentUpload_ownerId_fkey"
FOREIGN KEY ("ownerId")
REFERENCES "User"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentUpload"
ADD CONSTRAINT "DocumentUpload_ownerId_analysisId_fkey"
FOREIGN KEY ("ownerId", "analysisId")
REFERENCES "Analysis"("ownerId", "id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentUpload"
ADD CONSTRAINT "DocumentUpload_ownerId_analysisId_finalizedDocumentId_fkey"
FOREIGN KEY ("ownerId", "analysisId", "finalizedDocumentId")
REFERENCES "Document"("ownerId", "analysisId", "id")
ON DELETE RESTRICT
ON UPDATE CASCADE;
