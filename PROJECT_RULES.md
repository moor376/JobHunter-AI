# Project Rules

## Naming conventions

- Use `camelCase` for variables/functions, `PascalCase` for types/classes/components, and `kebab-case` for non-component filenames.
- Use clear domain names such as `candidateId`, `applicationStatus`, and `generatedEmail`.
- Prefer singular entity names and explicit timestamps such as `createdAt` and `sentAt`.

## TypeScript conventions

- Enable strict TypeScript when application configuration is added.
- Avoid `any`; model nullable and optional states deliberately.
- Validate runtime inputs with Zod and infer validated types where helpful.
- Keep provider DTOs distinct from domain models.

## Error handling and logging

- Use typed, actionable errors and map them to safe API responses.
- Log structured events with correlation IDs; redact secrets, tokens, CV content, emails, and personally identifiable information unless strictly necessary and approved.
- Record security-relevant and business-critical actions in `AuditLog`.

## Environment variables

- Read configuration centrally, validate it on startup, and fail safely when required values are absent.
- `.env` files are local-only; `.env.example` may contain keys but never values or real credentials.

## Git conventions

- Keep commits focused and descriptive; do not commit generated artifacts, secrets, uploads, or credentials.
- Review schema, integration, and security changes separately when feasible.
- Do not rewrite shared history without explicit approval.

## Testing requirements

- Add Vitest coverage for new domain behavior and regression cases.
- Test approval gates, validation, authorization, idempotency, duplicates, error handling, and redaction.
- Use fixtures and mocks; no test may send a real email or use a real provider credential.
