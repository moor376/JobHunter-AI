# AI Design

## CV parsing and candidate profile extraction

CV input will be treated as private, untrusted source material. A parsing pipeline should extract structured education, employment, skills, languages, and achievements with source references and confidence. Candidate-facing records require validation and correction; the model must not invent missing details.

## Job normalization

Source records will be normalized into a common job schema: employer, title, location, work arrangement, employment type, description, requirements, source identity, and timestamps. Preserve source links and raw-reference metadata for traceability, while avoiding unnecessary retention of raw private data.

## Job/CV matching and scoring

Matching will compare explicit skills, experience, seniority, location/work constraints, education, language, and target-role preferences. The result should be structured, explainable, and calibrated rather than presented as a guarantee. Score explanations must distinguish evidence from inference and surface missing requirements.

## Personalized email generation

Generation receives only approved candidate facts, a normalized job, the selected resume, and a versioned prompt. It produces a draft subject/body and citations to supporting candidate facts. The draft may not claim unverified achievements, fabricate a recipient, or imply an application was sent.

## Hallucination prevention

- Ground all output in record IDs and approved source facts.
- Require a constrained schema and validate output before display or persistence.
- Reject unsupported claims, invented metrics, employer names, credentials, recipients, and links.
- Show evidence and uncertainty to reviewers; fall back to a safe template when validation fails.

## Prompt versioning

Prompts belong in the `prompts/` directory and will have stable IDs, semantic versions, intended use, input schema, output schema, and change history. Every AIAnalysis and GeneratedEmail records the prompt version, model/provider metadata, input record versions, validation result, and reviewer decision.

## Human review before sending

AI has no direct sending capability. A human must review and explicitly approve the recipient, subject, body, CV attachment, job association, and claims before an email may enter the delivery workflow. Approval is recorded with actor, timestamp, content hash, and audit event; edits invalidate prior approval.
