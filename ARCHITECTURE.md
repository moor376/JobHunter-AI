# Architecture

## System overview

JobHunter-AI will use a modular monolith initially: a Next.js frontend communicates with a Node.js TypeScript backend/API; the backend owns domain workflows and accesses PostgreSQL through Prisma. Provider adapters isolate Gemini, Gmail, and job-source integrations. This shape supports a production-ready start without prematurely distributing services.

## Boundaries

| Boundary | Responsibility |
| --- | --- |
| Frontend | Authentication/session UX, CV and job views, email review/approval, dashboards; never holds provider secrets. |
| Backend | Authorization, validation, domain rules, orchestration, OpenAPI endpoints where appropriate, provider calls, audit logging. |
| Database | Durable, transactional storage for candidates, jobs, applications, generated content, event history, and audits. |
| Provider adapters | Typed, rate-limited interfaces for external systems; no provider-specific logic in domain workflows. |

## AI layer

The AI layer will parse and normalize CV-derived data, normalize jobs, calculate explainable match signals, and draft emails. It receives only approved context, returns structured validated output, records prompt/model provenance, and cannot send email. AI proposals require human review before use.

## Email layer

Gmail access will use OAuth 2.0 with minimal scopes and protected token storage. A sending workflow will require a reviewable generated email, recipient and attachment validation, duplicate checks, an approval gate, rate-limit checks, idempotency, and an auditable result. No sending is implemented in this phase.

## Job source layer

Each source will implement a common ingestion interface. Sources should be official APIs, feeds, public job pages, or permitted integrations. Ingestion will normalize records, deduplicate them, respect source policies, and apply timeouts, throttling, retries, and backoff. It will not bypass protections or depend on a single site.

## Application tracking layer

Application is the workflow aggregate: it links a candidate, resume version, job, generated email, and lifecycle events. State transitions will be transactional, enforce duplicate prevention, and produce audit records. Reply and provider events will be retained separately for traceability.

## Future n8n integration

n8n is a future orchestration option, not the source of truth. It should invoke authenticated, idempotent backend workflows or consume constrained events; approvals, authorization, audit logging, and persistence remain in the backend. Webhooks must be signed, replay-protected, and rate-limited.
