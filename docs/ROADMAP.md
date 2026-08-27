# Roadmap

## Phase 1 - Foundation (completed)
Repository standards, architecture, documentation, environment placeholders, strict TypeScript package boundaries, Prisma schema, centralized configuration validation, request validation and error handling, request IDs, health endpoint, initial backend module boundaries, regression tests, and a minimal Next.js frontend shell.

Phase 1 deliberately has no migrations, database service, authentication, provider integrations, or private candidate data. The next implementation step is Phase 2: candidate/CV management.

## Phase 2 - Candidate/CV management
Candidate profiles, private resume storage, versioning, parsing workflow, and access controls.

## Phase 3 - Job ingestion
Permitted multi-source adapters, normalization, throttling, deduplication, and ingestion monitoring.

## Phase 4 - AI job matching
Grounded CV/job analysis, explainable match scoring, and reviewable recommendations.

## Phase 5 - AI email generation
Versioned prompts and grounded, personalized draft emails with human review.

## Phase 6 - Gmail OAuth and sending
OAuth 2.0, secure token handling, approval-gated sending, limits, idempotency, and delivery logging.

## Phase 7 - Application tracking
Application lifecycle, duplicate prevention, audit history, and searchable records.

## Phase 8 - Reply tracking
Email events, reply association, state updates, and manual review flows.

## Phase 9 - Dashboard
Candidate, job, match, draft, approval, and application status views.

## Phase 10 - n8n automation
Optional signed, idempotent workflow triggers with backend-owned authorization and state.

## Phase 11 - Production deployment
CI/CD, managed infrastructure, backups, deployment configuration, and operational runbooks.

## Phase 12 - Security hardening and monitoring
Threat modeling, observability, alerting, retention controls, dependency review, and incident readiness.
