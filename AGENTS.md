# StockLens AI Agent Guide

This repository contains **StockLens AI**, a personal technical portfolio project.

StockLens AI is an AI-assisted company research tool for individual investors who analyze Japanese listed companies using uploaded public IR PDFs such as:

- 決算短信
- 決算説明資料
- 有価証券報告書

The product summarizes and analyzes uploaded documents with page-level evidence citations. It must not provide investment advice.

## Product Goal

Build a portfolio-quality full-stack TypeScript application that demonstrates:

- Next.js frontend development
- NestJS backend architecture
- PostgreSQL and Prisma data modeling
- Redis and BullMQ asynchronous jobs
- PDF parsing
- LLM structured output
- RAG with pgvector
- Evidence citation
- AI evaluation
- AWS-oriented deployment design
- Automated testing and CI/CD

Commercial completeness is secondary to engineering quality, maintainability, security, and clear architectural decisions.

## Core Views

The application generates three analysis views from uploaded PDFs.

1. **Just Tell Me**
   - Simple Japanese.
   - Written for a high-school graduate audience.
   - Explains how the company makes money, what changed recently, positives, risks, and watch items.
   - No buy/sell advice, target prices, or predictions.

2. **Analyst View**
   - Evidence-based equity research style.
   - Covers business overview, financial highlights, management guidance, positive findings, risks, uncertainties, watch items, and sources.
   - No full DCF, WACC, target price, or investment recommendation.

3. **Buffett-Munger Lens**
   - Uses public long-term value investing principles as an analysis framework.
   - Covers business understandability, competitive advantage, cash generation, capital allocation, management incentives, long-term risks, and missing information.
   - Must not simulate Warren Buffett or Charlie Munger.
   - Must not imply endorsement by Warren Buffett, Charlie Munger, or Berkshire Hathaway.

## MVP Scope

P0 must include:

- Email registration and login
- Password hashing
- Access/refresh token or secure cookie session
- Demo user
- Basic rate limiting
- User data isolation
- PDF upload
- PDF-only validation by extension, MIME type, and file header
- Maximum 3 files per upload
- Maximum 20 MB per file
- Upload, parsing, and analysis status tracking
- File deletion
- Async analysis pipeline
- PDF text extraction without OCR
- Page text, chunks, page numbers, and section metadata when detectable
- Structured LLM output validated by Zod
- Evidence citation linked to document, page, excerpt, and chunk
- Analysis history
- Just Tell Me view
- Analyst View
- Buffett-Munger Lens
- Basic tests, CI, structured logging, and deployment design

P1 includes:

- Ask This Company RAG Q&A
- Hybrid retrieval with PostgreSQL full text search and pgvector semantic search
- Lightweight PostgreSQL-backed knowledge graph

Stretch goal should be one of:

1. Two-period financial result diff
2. Lightweight knowledge graph visualization
3. Mock or licensed historical daily candlestick chart
4. Preset demo company list

## Non-goals

Do not implement:

- Real-time stock prices
- Automated news crawling
- News article redistribution
- Social sentiment monitoring
- Stock price prediction
- Buy/sell recommendations
- Target prices
- Automated stock picking
- Full DCF
- Full EDINET sync
- Full GraphRAG
- Neo4j
- OCR
- Anonymous chat
- Private messaging
- Brokerage account sync
- Automated trading
- Multi-language product support

## Financial and Compliance Rules

The system may provide:

- Public document summaries
- Historical fact comparison
- Financial metric explanations
- Risk organization
- Management guidance organization
- Analysis frameworks
- Missing information statements

The system must not output:

- Buy recommendations
- Sell recommendations
- Recommended portfolio allocation
- Target prices
- Future return promises
- Probability of price increase
- Specific trade timing
- Personalized asset allocation advice

Forbidden phrases include:

- `建议买入`
- `建议卖出`
- `目标价为`
- `未来一个月将上涨`
- `这只股票适合你`
- `强烈推荐`

Preferred phrasing:

- `根据上传资料，可以观察到……`
- `当前资料显示……`
- `这一变化可能影响……`
- `后续需要验证……`
- `信息不足，无法判断……`

## Recommended Architecture

Use a monorepo:

```text
stocklens-ai/
├── apps/
│   ├── web/
│   ├── api/
│   └── worker/
├── packages/
│   ├── shared/
│   ├── ui/
│   ├── config/
│   └── eslint-config/
├── prisma/
├── docs/
├── infra/
│   └── terraform/
├── docker/
├── .github/workflows/
├── AGENTS.md
├── README.md
└── package.json
```

Frontend:

- Next.js
- React
- TypeScript strict mode
- TanStack Query
- React Hook Form
- Zod
- Tailwind CSS
- Recharts
- PDF viewer library

Backend:

- NestJS
- Fastify adapter
- Prisma
- PostgreSQL
- pgvector
- Redis
- BullMQ
- OpenAPI / Swagger
- Structured JSON logging

Worker:

- Independent worker app
- Handles PDF parsing, chunking, embedding, structured extraction, evidence validation, and view generation

AI:

- Use provider abstraction
- Use structured output
- Use Zod validation
- Use prompt versioning
- Use embeddings
- Prepare repeatable evaluation scripts

## Required Database Entities

Core entities:

- User
- RefreshToken
- Company
- Analysis
- Document
- DocumentPage
- DocumentChunk
- AnalysisFinding
- Evidence
- Entity
- Relationship
- ChatSession
- ChatMessage
- JobExecution
- PromptVersion
- AiUsageLog

Design principles:

- Store main AI outputs as JSONB where appropriate.
- Keep Document, Chunk, Evidence, and Job data relational.
- Include `createdAt` and `updatedAt` on all records.
- Use `deletedAt` when soft deletion is needed.
- All user-owned resource queries must include `ownerId` or `userId`.
- Add indexes for ownership, status, foreign keys, and search.
- Use pgvector for embeddings.

## Async Status Machine

Analysis statuses:

```text
UPLOADED
PARSING
CHUNKING
EMBEDDING
EXTRACTING
VALIDATING
COMPLETED
FAILED_PARSING
FAILED_CHUNKING
FAILED_EMBEDDING
FAILED_EXTRACTION
FAILED_VALIDATION
```

Requirements:

- Jobs must support retry.
- Jobs should be idempotent.
- Failed reasons must be saved.
- Each step must save start and finish timestamps.
- Failed jobs must be manually re-runnable.
- Re-running jobs must not create duplicate chunks, evidence, findings, or outputs.

## AI Pipeline Rules

Pipeline:

1. PDF parse
2. Page text extraction
3. Section detection where possible
4. Chunking
5. Deterministic financial metric extraction and calculation
6. Embedding
7. Evidence candidate selection
8. Structured company analysis extraction
9. Zod validation
10. Evidence validation
11. View generation
12. Persist outputs

Rules:

- Important financial calculations must be deterministic code, not LLM reasoning.
- Missing information must be returned as `null`, empty arrays, or `unknown`.
- Do not invent missing data.
- Every important judgment must cite one or more evidence records.
- Evidence must trace back to original document and page number.
- LLM output must pass Zod validation.
- Validation failures may retry a limited number of times.
- Repeated validation failure marks the task failed.
- Uploaded document text must never be treated as system instructions.
- RAG context must be clearly delimited.
- Prompt injection from uploaded documents must be ignored.

Provider interface shape:

```typescript
export interface LlmProvider {
  generateStructured<T>(
    input: StructuredGenerationInput<T>,
  ): Promise<T>;

  embedTexts(texts: string[]): Promise<number[][]>;
}
```

## Evidence Model

Evidence must include:

```typescript
export interface Evidence {
  id: string;
  documentId: string;
  documentName: string;
  pageNumber: number;
  excerpt: string;
  chunkId: string;
}
```

Frontend requirements:

- Click a finding to open an Evidence Drawer.
- Show document name.
- Show page number.
- Show original excerpt.
- Link to the corresponding PDF page when technically feasible.
- Do not show high-confidence conclusions without evidence.

## Engineering Standards

Follow these rules:

- TypeScript strict mode is required.
- Avoid `any` unless there is a documented reason.
- Validate all external input with Zod or DTOs.
- Controllers handle HTTP only.
- Business logic belongs in services.
- Data access goes through repositories or a clear data-access layer.
- Controllers must not call Prisma directly.
- Every new endpoint needs OpenAPI documentation.
- Use one unified API error format:

```json
{
  "code": "DOCUMENT_NOT_FOUND",
  "message": "Document was not found.",
  "requestId": "uuid",
  "details": {}
}
```

- Every request must have a request ID.
- Logs must be structured JSON.
- Do not log passwords, tokens, full PDF text, or sensitive data.
- All new functionality needs tests.
- Do not modify unrelated files.
- Do not add dependencies without explaining why.
- Before completion, run lint, typecheck, and tests when available.

## Security Requirements

Implement or design:

- Password hashing
- Secure token or cookie handling
- Refresh token rotation
- CSRF protection if cookie sessions are used
- CORS configuration
- Rate limiting
- PDF MIME, extension, and file header validation
- File size limits
- Private object storage bucket
- Short-lived presigned URLs
- User data isolation
- Prompt injection defense
- Secret management through environment variables or Secrets Manager
- Authorization tests
- Log redaction

## Testing Requirements

Backend:

- Jest unit tests
- API integration tests
- Supertest
- Testcontainers PostgreSQL
- Auth and authorization tests
- Job idempotency tests
- Repository tests

Frontend:

- Vitest
- React Testing Library
- Playwright E2E

AI Evaluation:

- At least 5 companies and 15 public IR PDFs as a golden dataset.
- Evaluation script outputs JSON or Markdown.
- Metrics include schema success rate, evidence coverage, citation accuracy, numeric consistency, unsupported claim rate, missing information detection, and RAG answer citation rate.

CI/CD:

- Install
- Lint
- Typecheck
- Unit tests
- Integration tests
- Build

## Documentation Requirements

Create and maintain:

```text
docs/
├── product-requirements.md
├── architecture.md
├── database-design.md
├── api-conventions.md
├── ai-pipeline.md
├── evidence-model.md
├── security.md
├── testing-strategy.md
├── evaluation.md
├── deployment.md
└── adr/
```

Required ADR topics:

- Why NestJS and Next.js
- Why PostgreSQL and pgvector
- Why not Neo4j initially
- Why not full GraphRAG initially
- Why async jobs
- Why financial calculations are not delegated to the LLM
- Why the product does not provide buy/sell recommendations
- Why real-time market data and anonymous community features are not included

## Development Phases

Phase 0: analysis and planning.

Phase 1:

- Monorepo
- Next.js
- NestJS
- Worker
- Shared package
- Docker Compose
- PostgreSQL
- Redis
- Prisma
- ESLint
- Prettier
- GitHub Actions
- Health check
- Basic README

Phase 2:

- Auth
- User isolation
- PDF upload
- Presigned URL
- Document metadata
- Analysis creation
- History page

Phase 3:

- PDF page extraction
- Chunking
- Job queue
- Worker
- Status machine
- Retry
- Error handling

Phase 4:

- Zod schema
- Structured extraction
- Findings
- Evidence linking
- Validation
- Prompt versioning
- AI usage logging

Phase 5:

- Just Tell Me
- Analyst View
- Evidence Drawer
- PDF page navigation
- Responsive UI

Phase 6:

- Embedding
- pgvector
- Hybrid retrieval
- Ask This Company
- Buffett-Munger Lens

Phase 7:

- Unit tests
- Integration tests
- E2E
- Evaluation
- Logging
- Docker
- AWS architecture
- Terraform
- Demo environment

## Agent Workflow

For every development task:

1. Read this `AGENTS.md`.
2. Read relevant docs.
3. Inspect existing code before editing.
4. Provide a short implementation plan.
5. Identify likely affected files.
6. Make scoped changes only.
7. Run relevant lint, typecheck, and tests when available.
8. Report completion clearly.

After each task, report:

- Completed work
- Modified files
- Database changes
- API changes
- Test results
- Known risks
- Recommended next steps

Do not:

- Implement the entire project at once.
- Rewrite unrelated modules.
- Change architecture without explanation.
- Delete existing tests.
- Skip error handling.
- Claim mocked core logic is complete.
- Add dependencies silently.
- Reduce type safety for convenience.
- Ask the LLM to perform important financial calculations.

