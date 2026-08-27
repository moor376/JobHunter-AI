# JobHunter-AI

JobHunter-AI is a security-first assistant for managing a candidate's job-search workflow. It helps discover permitted job opportunities, assess CV compatibility, draft personalized application emails, support explicit Gmail-approved sends, and track applications and replies.

The initial candidate profile is Nayera Tarek Mohamed: a banking tele-sales professional with 3+ years of experience across SAIB Bank, ADIB Bank, Al Ahli Bank of Kuwait, and Attijariwafa Bank, plus advanced public-law education. Initial target roles include tele-sales, banking sales, customer service, relationship officer, banking operations, financial services, and relevant legal roles.

## Goals

- Provide a modular, auditable job-application workflow.
- Use AI only as a reviewable assistant, grounded in candidate and job data.
- Prevent duplicate applications and preserve a complete application history.
- Integrate with approved job sources and Gmail only through permitted, rate-limited APIs or public sources.

## Architecture

The stack is a TypeScript backend (Express 5, Node.js), a TypeScript Next.js frontend (Next.js 15, React 19), PostgreSQL with Prisma, Gemini for controlled AI workflows with a deterministic grounded fallback engine, Gmail OAuth 2.0 simulation & delivery, Zod validation, and Vitest testing. See [ARCHITECTURE.md](ARCHITECTURE.md) for boundaries and [docs/DATABASE_DESIGN.md](docs/DATABASE_DESIGN.md) for the data model.

## Implemented Core Capabilities

1. **Candidate & CV Management**:
   - Candidate profile CRUD with Nayera Tarek Mohamed banking/law profile.
   - Consent management (`GRANTED`, `PENDING`, `REVOKED`).
   - Resume upload, SHA-256 checksum calculation, and automatic versioning.
   - Structured AI CV Parser extracting banking work experience, education, skills, and languages.

2. **Job Ingestion & Deduplication**:
   - Job Source management (`OFFICIAL_API`, `RSS_FEED`, `CAREERS_PAGE`, `MANUAL`).
   - Ingestion engine with multi-source adapters.
   - Intelligent deduplication via source ID + external ID and content hashing (`title|company|location|description`).
   - Rich filtering by search term, employment type, location, source, and status.

3. **AI Job Matching & Scoring**:
   - AI Compatibility Evaluator comparing verified candidate facts against job openings.
   - Calibrated match scores (0-100), categorization (`STRONG_MATCH`, `POTENTIAL_MATCH`, `LOW_MATCH`), matched skills, missing requirements, strengths, gaps, and transparent reasoning.
   - Full persistence in `AIAnalysis`.

4. **AI Personalized Application Draft Generator**:
   - Grounded cover letter & email generation based exclusively on verified background facts.
   - Versioned prompt templates in `prompts/` (`cv-parse-v1.json`, `job-match-v1.json`, `email-draft-v1.json`).
   - SHA-256 content hashing to prevent duplicate drafts.

5. **Human Review & Approval Gate (Security Enforced)**:
   - Strict security check: Applications and generated emails cannot be dispatched without explicit human review and approval (`reviewStatus: APPROVED` + `consentStatus: GRANTED`).
   - 1-click Approval / Rejection review actions with audit trail.

6. **Application Delivery & Lifecycle Tracking**:
   - End-to-end pipeline stages: `DRAFT` -> `PENDING_APPROVAL` -> `APPROVED` -> `SENDING` -> `SENT` -> `REPLIED`.
   - Idempotent send execution and duplicate send prevention.
   - Recruiter reply logging.

7. **Audit Trails & Security**:
   - In-memory rate limiting and CORS middleware.
   - Request correlation IDs (`X-Request-ID`).
   - PII and token redaction in logs.
   - Immutable audit trail recording every state change in `AuditLog`.

8. **Interactive Next.js Dashboard**:
   - Unified UI with tabs for Overview, Candidate Profile & CV, Job Board & Ingestion, AI Matcher, Email Review Gate, Application Pipeline Kanban, and Audit Logs.

## Local development

Node.js 20 or newer is required.

```text
cd backend
npm install
npm test
npm run build
```

In a second terminal:

```text
cd frontend
npm install
npm run build
npm run dev
```

Run the backend with `npm run dev` and the frontend with `npm run dev`. Copy `.env.example` to `.env` to configure live Gemini API keys (`GEMINI_API_KEY`) or Google OAuth credentials if desired.
