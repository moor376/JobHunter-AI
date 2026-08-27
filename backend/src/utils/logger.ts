const sensitiveKeyPattern =
  /token|authorization|api[-_]?key|secret|password|cookie|email|phone|resume|document/i;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redact);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [
        key,
        sensitiveKeyPattern.test(key) ? "[REDACTED]" : redact(entryValue),
      ]),
    );
  }

  return value;
}

export function logInfo(event: Record<string, unknown>): void {
  console.info(JSON.stringify(redact(event)));
}

export function logError(event: Record<string, unknown>): void {
  console.error(JSON.stringify(redact(event)));
}
