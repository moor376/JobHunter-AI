# Agent Working Agreement

## Coding rules

- Use TypeScript for application code; favor small, focused modules and explicit types at system boundaries.
- Validate untrusted input with Zod before it reaches business logic.
- Keep frontend presentation, backend orchestration, and persistence concerns separate.
- Do not add dependencies, integrations, or migrations without a scoped task and review.

## Architecture rules

- Keep providers behind interfaces so job sources, AI models, email providers, and automation tools remain replaceable.
- Place domain logic outside route handlers, UI components, and provider clients.
- Treat external responses and AI output as untrusted data.

## Security rules

- Never hardcode, log, commit, or expose secrets, OAuth tokens, API keys, or candidate documents.
- Use least-privilege OAuth scopes and secure session/token storage.
- Do not implement CAPTCHA, authentication, anti-bot, or terms-of-service bypasses.
- Redact sensitive fields in logs and audit access to sensitive records.

## Testing rules

- Use Vitest for unit and integration tests once code is introduced.
- Cover validation, authorization, duplicate prevention, approval gates, and provider failure paths.
- Mock external providers; tests must not send email or call live AI, Gmail, or job sources by default.

## Database rules

- Use Prisma with PostgreSQL after the database phase is authorized.
- Add migrations only through reviewed, reversible migration files; never change production data manually.
- Enforce uniqueness for duplicate-application prevention and use transactions for state transitions.

## API integration rules

- Prefer official APIs, feeds, public job pages, or expressly permitted integrations.
- Apply timeouts, rate limiting, retries with exponential backoff, idempotency, and structured error handling.
- Do not scrape aggressively or rely on one job provider.

## AI safety and reliability rules

- Ground prompts in approved candidate and job records; do not invent qualifications, employers, metrics, or contact details.
- Version prompts and persist provenance, input references, model metadata, and review state.
- Require review of generated application email before it can be sent.

## Email sending rules

- Never send automatically without explicit user approval or later-configured, auditable rules.
- Check recipient, attachment, duplicate status, consent, and Gmail limits before sending.
- Record every send attempt, provider result, and lifecycle event without storing secret tokens in logs.
