# Proposed Database Design

No migrations are created in Phase 1. PostgreSQL and Prisma are the proposed persistence stack; all identifiers should be stable UUIDs, timestamps UTC, and sensitive data access audited.

| Entity | Purpose and key relationships |
| --- | --- |
| Candidate | Candidate identity, contact details, consent/preferences, target roles, and profile summary. Has many resumes, applications, analyses, and audit entries. |
| Resume | Private candidate CV version with storage reference, checksum, parsed structured data, parse status, and source metadata. Belongs to Candidate. |
| Company | Normalized employer name, website/domain, location, and metadata. Has many Jobs. |
| JobSource | Source configuration and policy metadata: type, permitted access method, external source ID, rate settings, and health status. Has many Jobs. |
| Job | Normalized opening: title, description, location, employment type, source URL/external ID, status, posted/seen timestamps, and raw-reference metadata. Belongs to Company and JobSource; has many applications and analyses. |
| Application | Candidate-to-job lifecycle aggregate: resume snapshot/version, status, duplicate key, approval/sent timestamps, and links to selected generated email. Unique candidate/job or equivalent canonical application key prevents duplicates. |
| GeneratedEmail | Draft subject/body, recipient metadata, attachment selection, prompt version, review/approval status, content hash, and generation provenance. Belongs to Application and may reference AIAnalysis. |
| EmailAccount | Authorized sending account reference, provider, encrypted token reference (not plaintext), scopes, token expiry, account status, and consent metadata. Belongs to Candidate or authorized user context. |
| EmailEvent | Immutable provider/application email events: draft, approval, send attempt, sent, failed, delivered/bounced/replied where available; includes provider message/thread IDs and safe error metadata. |
| AIAnalysis | Structured CV parse, job normalization, match score/explanations, model/prompt version, input record versions, validation state, and reviewer decision. References Candidate, Resume, Job, or GeneratedEmail as applicable. |
| AuditLog | Append-oriented actor/action/resource/event record with correlation ID, timestamp, safe metadata, and before/after summaries that exclude secrets. |

## Constraints and indexes

- Unique source identity: `(jobSourceId, externalJobId)` where available; canonical URL/content hashes supplement it.
- Duplicate prevention: a unique application key based on candidate, canonical job, and policy-defined application channel.
- Index active jobs by status, source, company, location, and timestamps; index applications by candidate, status, and sent time.
- Use foreign keys, state enums, optimistic concurrency or transactional guards for workflow updates, and retain email/audit events immutably.
- Store resumes and OAuth material outside ordinary database fields when possible: private object storage for files and an encrypted secret store or encrypted columns for tokens, with only references/metadata exposed to application code.
