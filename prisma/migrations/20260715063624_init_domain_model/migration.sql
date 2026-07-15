-- EnableExtension
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('UPLOADED', 'PARSING', 'CHUNKING', 'EMBEDDING', 'EXTRACTING', 'VALIDATING', 'COMPLETED', 'FAILED_PARSING', 'FAILED_CHUNKING', 'FAILED_EMBEDDING', 'FAILED_EXTRACTION', 'FAILED_VALIDATION');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('EARNINGS_SUMMARY', 'EARNINGS_PRESENTATION', 'ANNUAL_SECURITIES_REPORT', 'OTHER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "FindingCategory" AS ENUM ('BUSINESS_OVERVIEW', 'FINANCIAL_HIGHLIGHT', 'MANAGEMENT_GUIDANCE', 'POSITIVE', 'RISK', 'UNCERTAINTY', 'WATCH_ITEM', 'MISSING_INFORMATION');

-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('SUPPORTED', 'INSUFFICIENT_EVIDENCE');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('COMPANY', 'PERSON', 'BUSINESS_SEGMENT', 'PRODUCT', 'FINANCIAL_METRIC', 'ORGANIZATION', 'OTHER');

-- CreateEnum
CREATE TYPE "ChatRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ChatMessageStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "JobStep" AS ENUM ('PARSE', 'DETECT_SECTIONS', 'CHUNK', 'CALCULATE_FINANCIAL_METRICS', 'EMBED', 'SELECT_EVIDENCE', 'EXTRACT', 'VALIDATE', 'GENERATE_VIEWS', 'PERSIST');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "AiOperation" AS ENUM ('STRUCTURED_GENERATION', 'EMBEDDING');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "emailVerifiedAt" TIMESTAMPTZ(3),
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "replacedByTokenId" UUID,
    "lastUsedAt" TIMESTAMPTZ(3),
    "userAgentHash" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" UUID NOT NULL,
    "nameJa" TEXT NOT NULL,
    "nameEn" TEXT,
    "ticker" TEXT,
    "exchange" TEXT,
    "edinetCode" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Analysis" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "companyId" UUID,
    "title" TEXT NOT NULL,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'UPLOADED',
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "justTellMeOutput" JSONB,
    "analystViewOutput" JSONB,
    "buffettMungerOutput" JSONB,
    "financialMetrics" JSONB,
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Analysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "analysisId" UUID NOT NULL,
    "originalName" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL DEFAULT 'UNKNOWN',
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageBucket" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "pageCount" INTEGER,
    "uploadedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentPage" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "textSha256" TEXT NOT NULL,
    "sectionMetadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DocumentPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentChunk" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "pageId" UUID NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "section" TEXT,
    "content" TEXT NOT NULL,
    "contentSha256" TEXT NOT NULL,
    "tokenCount" INTEGER,
    "embedding" vector,
    "embeddingModel" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisFinding" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "analysisId" UUID NOT NULL,
    "findingKey" TEXT NOT NULL,
    "category" "FindingCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "importance" INTEGER NOT NULL,
    "status" "FindingStatus" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AnalysisFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "analysisId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "pageId" UUID NOT NULL,
    "chunkId" UUID NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "excerpt" TEXT NOT NULL,
    "excerptSha256" TEXT NOT NULL,
    "startOffset" INTEGER,
    "endOffset" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FindingEvidence" (
    "ownerId" UUID NOT NULL,
    "findingId" UUID NOT NULL,
    "evidenceId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FindingEvidence_pkey" PRIMARY KEY ("findingId","evidenceId")
);

-- CreateTable
CREATE TABLE "Entity" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "analysisId" UUID NOT NULL,
    "type" "EntityType" NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "attributes" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Entity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Relationship" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "analysisId" UUID NOT NULL,
    "sourceEntityId" UUID NOT NULL,
    "targetEntityId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "attributes" JSONB,
    "evidenceId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Relationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatSession" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "companyId" UUID,
    "analysisId" UUID,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "role" "ChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "status" "ChatMessageStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessageEvidence" (
    "ownerId" UUID NOT NULL,
    "chatMessageId" UUID NOT NULL,
    "evidenceId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ChatMessageEvidence_pkey" PRIMARY KEY ("chatMessageId","evidenceId")
);

-- CreateTable
CREATE TABLE "JobExecution" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "analysisId" UUID NOT NULL,
    "documentId" UUID,
    "step" "JobStep" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "currentAttempt" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT NOT NULL,
    "startedAt" TIMESTAMPTZ(3),
    "finishedAt" TIMESTAMPTZ(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "errorDetails" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "JobExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobAttempt" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "jobExecutionId" UUID NOT NULL,
    "attempt" INTEGER NOT NULL,
    "bullmqJobId" TEXT,
    "status" "JobStatus" NOT NULL,
    "startedAt" TIMESTAMPTZ(3),
    "finishedAt" TIMESTAMPTZ(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "errorDetails" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "JobAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptVersion" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "template" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "contentSha256" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PromptVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsageLog" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "analysisId" UUID,
    "jobExecutionId" UUID,
    "promptVersionId" UUID,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "operation" "AiOperation" NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "embeddingTokens" INTEGER,
    "estimatedCostMicros" BIGINT,
    "latencyMs" INTEGER NOT NULL,
    "requestId" TEXT,
    "providerRequestId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_replacedByTokenId_key" ON "RefreshToken"("replacedByTokenId");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_familyId_idx" ON "RefreshToken"("userId", "familyId");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Company_edinetCode_key" ON "Company"("edinetCode");

-- CreateIndex
CREATE INDEX "Company_nameJa_idx" ON "Company"("nameJa");

-- CreateIndex
CREATE UNIQUE INDEX "Company_ticker_exchange_key" ON "Company"("ticker", "exchange");

-- CreateIndex
CREATE INDEX "Analysis_ownerId_createdAt_idx" ON "Analysis"("ownerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Analysis_ownerId_status_idx" ON "Analysis"("ownerId", "status");

-- CreateIndex
CREATE INDEX "Analysis_companyId_idx" ON "Analysis"("companyId");

-- CreateIndex
CREATE INDEX "Analysis_deletedAt_idx" ON "Analysis"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Document_storageKey_key" ON "Document"("storageKey");

-- CreateIndex
CREATE INDEX "Document_ownerId_analysisId_idx" ON "Document"("ownerId", "analysisId");

-- CreateIndex
CREATE INDEX "Document_analysisId_createdAt_idx" ON "Document"("analysisId", "createdAt");

-- CreateIndex
CREATE INDEX "Document_ownerId_sha256_idx" ON "Document"("ownerId", "sha256");

-- CreateIndex
CREATE INDEX "Document_deletedAt_idx" ON "Document"("deletedAt");

-- CreateIndex
CREATE INDEX "DocumentPage_ownerId_documentId_idx" ON "DocumentPage"("ownerId", "documentId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentPage_documentId_pageNumber_key" ON "DocumentPage"("documentId", "pageNumber");

-- CreateIndex
CREATE INDEX "DocumentChunk_documentId_contentSha256_idx" ON "DocumentChunk"("documentId", "contentSha256");

-- CreateIndex
CREATE INDEX "DocumentChunk_ownerId_documentId_idx" ON "DocumentChunk"("ownerId", "documentId");

-- CreateIndex
CREATE INDEX "DocumentChunk_pageId_idx" ON "DocumentChunk"("pageId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentChunk_documentId_chunkIndex_key" ON "DocumentChunk"("documentId", "chunkIndex");

-- CreateIndex
CREATE INDEX "AnalysisFinding_ownerId_analysisId_idx" ON "AnalysisFinding"("ownerId", "analysisId");

-- CreateIndex
CREATE INDEX "AnalysisFinding_analysisId_category_idx" ON "AnalysisFinding"("analysisId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisFinding_analysisId_findingKey_key" ON "AnalysisFinding"("analysisId", "findingKey");

-- CreateIndex
CREATE INDEX "Evidence_ownerId_analysisId_idx" ON "Evidence"("ownerId", "analysisId");

-- CreateIndex
CREATE INDEX "Evidence_documentId_pageNumber_idx" ON "Evidence"("documentId", "pageNumber");

-- CreateIndex
CREATE INDEX "Evidence_pageId_idx" ON "Evidence"("pageId");

-- CreateIndex
CREATE INDEX "Evidence_chunkId_idx" ON "Evidence"("chunkId");

-- CreateIndex
CREATE UNIQUE INDEX "Evidence_analysisId_documentId_pageNumber_excerptSha256_key" ON "Evidence"("analysisId", "documentId", "pageNumber", "excerptSha256");

-- CreateIndex
CREATE INDEX "FindingEvidence_ownerId_findingId_idx" ON "FindingEvidence"("ownerId", "findingId");

-- CreateIndex
CREATE INDEX "FindingEvidence_evidenceId_idx" ON "FindingEvidence"("evidenceId");

-- CreateIndex
CREATE INDEX "Entity_ownerId_analysisId_idx" ON "Entity"("ownerId", "analysisId");

-- CreateIndex
CREATE UNIQUE INDEX "Entity_analysisId_type_normalizedName_key" ON "Entity"("analysisId", "type", "normalizedName");

-- CreateIndex
CREATE INDEX "Relationship_ownerId_analysisId_idx" ON "Relationship"("ownerId", "analysisId");

-- CreateIndex
CREATE INDEX "Relationship_sourceEntityId_idx" ON "Relationship"("sourceEntityId");

-- CreateIndex
CREATE INDEX "Relationship_targetEntityId_idx" ON "Relationship"("targetEntityId");

-- CreateIndex
CREATE INDEX "Relationship_evidenceId_idx" ON "Relationship"("evidenceId");

-- CreateIndex
CREATE INDEX "ChatSession_ownerId_createdAt_idx" ON "ChatSession"("ownerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ChatSession_companyId_idx" ON "ChatSession"("companyId");

-- CreateIndex
CREATE INDEX "ChatSession_analysisId_idx" ON "ChatSession"("analysisId");

-- CreateIndex
CREATE INDEX "ChatSession_deletedAt_idx" ON "ChatSession"("deletedAt");

-- CreateIndex
CREATE INDEX "ChatMessage_ownerId_sessionId_idx" ON "ChatMessage"("ownerId", "sessionId");

-- CreateIndex
CREATE INDEX "ChatMessage_sessionId_createdAt_idx" ON "ChatMessage"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessageEvidence_ownerId_chatMessageId_idx" ON "ChatMessageEvidence"("ownerId", "chatMessageId");

-- CreateIndex
CREATE INDEX "ChatMessageEvidence_evidenceId_idx" ON "ChatMessageEvidence"("evidenceId");

-- CreateIndex
CREATE UNIQUE INDEX "JobExecution_idempotencyKey_key" ON "JobExecution"("idempotencyKey");

-- CreateIndex
CREATE INDEX "JobExecution_ownerId_analysisId_idx" ON "JobExecution"("ownerId", "analysisId");

-- CreateIndex
CREATE INDEX "JobExecution_analysisId_step_status_idx" ON "JobExecution"("analysisId", "step", "status");

-- CreateIndex
CREATE INDEX "JobExecution_documentId_idx" ON "JobExecution"("documentId");

-- CreateIndex
CREATE INDEX "JobAttempt_ownerId_jobExecutionId_idx" ON "JobAttempt"("ownerId", "jobExecutionId");

-- CreateIndex
CREATE INDEX "JobAttempt_bullmqJobId_idx" ON "JobAttempt"("bullmqJobId");

-- CreateIndex
CREATE UNIQUE INDEX "JobAttempt_jobExecutionId_attempt_key" ON "JobAttempt"("jobExecutionId", "attempt");

-- CreateIndex
CREATE UNIQUE INDEX "PromptVersion_contentSha256_key" ON "PromptVersion"("contentSha256");

-- CreateIndex
CREATE INDEX "PromptVersion_name_isActive_idx" ON "PromptVersion"("name", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PromptVersion_name_version_key" ON "PromptVersion"("name", "version");

-- CreateIndex
CREATE INDEX "AiUsageLog_ownerId_createdAt_idx" ON "AiUsageLog"("ownerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AiUsageLog_analysisId_idx" ON "AiUsageLog"("analysisId");

-- CreateIndex
CREATE INDEX "AiUsageLog_jobExecutionId_idx" ON "AiUsageLog"("jobExecutionId");

-- CreateIndex
CREATE INDEX "AiUsageLog_promptVersionId_idx" ON "AiUsageLog"("promptVersionId");

-- AddCheckConstraint
ALTER TABLE "Document"
ADD CONSTRAINT "Document_sizeBytes_check"
CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 20971520);

ALTER TABLE "Document"
ADD CONSTRAINT "Document_pageCount_check"
CHECK ("pageCount" IS NULL OR "pageCount" > 0);

ALTER TABLE "DocumentPage"
ADD CONSTRAINT "DocumentPage_pageNumber_check"
CHECK ("pageNumber" > 0);

ALTER TABLE "DocumentChunk"
ADD CONSTRAINT "DocumentChunk_chunkIndex_check"
CHECK ("chunkIndex" >= 0);

ALTER TABLE "DocumentChunk"
ADD CONSTRAINT "DocumentChunk_tokenCount_check"
CHECK ("tokenCount" IS NULL OR "tokenCount" >= 0);

ALTER TABLE "Evidence"
ADD CONSTRAINT "Evidence_pageNumber_check"
CHECK ("pageNumber" > 0);

ALTER TABLE "Evidence"
ADD CONSTRAINT "Evidence_offsets_check"
CHECK (
  ("startOffset" IS NULL AND "endOffset" IS NULL)
  OR (
    "startOffset" IS NOT NULL
    AND "endOffset" IS NOT NULL
    AND "startOffset" >= 0
    AND "endOffset" >= "startOffset"
  )
);

ALTER TABLE "JobExecution"
ADD CONSTRAINT "JobExecution_currentAttempt_check"
CHECK ("currentAttempt" >= 0);

ALTER TABLE "JobAttempt"
ADD CONSTRAINT "JobAttempt_attempt_check"
CHECK ("attempt" > 0);

ALTER TABLE "AiUsageLog"
ADD CONSTRAINT "AiUsageLog_usage_check"
CHECK (
  ("inputTokens" IS NULL OR "inputTokens" >= 0)
  AND ("outputTokens" IS NULL OR "outputTokens" >= 0)
  AND ("embeddingTokens" IS NULL OR "embeddingTokens" >= 0)
  AND ("estimatedCostMicros" IS NULL OR "estimatedCostMicros" >= 0)
  AND "latencyMs" >= 0
);

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_replacedByTokenId_fkey" FOREIGN KEY ("replacedByTokenId") REFERENCES "RefreshToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Analysis" ADD CONSTRAINT "Analysis_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Analysis" ADD CONSTRAINT "Analysis_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPage" ADD CONSTRAINT "DocumentPage_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentPage" ADD CONSTRAINT "DocumentPage_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "DocumentPage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisFinding" ADD CONSTRAINT "AnalysisFinding_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisFinding" ADD CONSTRAINT "AnalysisFinding_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "DocumentPage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "DocumentChunk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FindingEvidence" ADD CONSTRAINT "FindingEvidence_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FindingEvidence" ADD CONSTRAINT "FindingEvidence_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "AnalysisFinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FindingEvidence" ADD CONSTRAINT "FindingEvidence_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entity" ADD CONSTRAINT "Entity_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entity" ADD CONSTRAINT "Entity_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_sourceEntityId_fkey" FOREIGN KEY ("sourceEntityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_targetEntityId_fkey" FOREIGN KEY ("targetEntityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Relationship" ADD CONSTRAINT "Relationship_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessageEvidence" ADD CONSTRAINT "ChatMessageEvidence_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessageEvidence" ADD CONSTRAINT "ChatMessageEvidence_chatMessageId_fkey" FOREIGN KEY ("chatMessageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessageEvidence" ADD CONSTRAINT "ChatMessageEvidence_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobExecution" ADD CONSTRAINT "JobExecution_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobExecution" ADD CONSTRAINT "JobExecution_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobExecution" ADD CONSTRAINT "JobExecution_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobAttempt" ADD CONSTRAINT "JobAttempt_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobAttempt" ADD CONSTRAINT "JobAttempt_jobExecutionId_fkey" FOREIGN KEY ("jobExecutionId") REFERENCES "JobExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsageLog" ADD CONSTRAINT "AiUsageLog_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsageLog" ADD CONSTRAINT "AiUsageLog_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsageLog" ADD CONSTRAINT "AiUsageLog_jobExecutionId_fkey" FOREIGN KEY ("jobExecutionId") REFERENCES "JobExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsageLog" ADD CONSTRAINT "AiUsageLog_promptVersionId_fkey" FOREIGN KEY ("promptVersionId") REFERENCES "PromptVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
