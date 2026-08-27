import { loadEnvironment } from "../../config/env.js";
import { AppError } from "../../utils/app-error.js";
import { DocxResumeParser } from "./docx-parser.js";
import { detectMimeTypeFromBuffer, sanitizeFilename } from "./magic-bytes.js";
import { PdfResumeParser } from "./pdf-parser.js";
import { PlainTextResumeParser } from "./plain-text-parser.js";
import type { ExtractedResumeText, ResumeFileParser, ValidatedResumeFile } from "./types.js";

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
  "text/markdown",
];

const pdfParser = new PdfResumeParser();
const docxParser = new DocxResumeParser();
const textParser = new PlainTextResumeParser();

export function validateResumeUpload(input: {
  buffer: Buffer;
  filename?: string;
  declaredMimeType?: string;
}): ValidatedResumeFile {
  const env = loadEnvironment();
  const maxSizeBytes = env.MAX_RESUME_SIZE_BYTES || 5 * 1024 * 1024;

  if (!input.buffer || input.buffer.length === 0) {
    throw new AppError("Resume file buffer is empty.", 400, "EMPTY_FILE_BUFFER");
  }

  // 1. File Size Validation
  if (input.buffer.length > maxSizeBytes) {
    const maxMb = Math.round(maxSizeBytes / (1024 * 1024));
    throw new AppError(
      `File size (${Math.round(input.buffer.length / 1024)} KB) exceeds maximum allowed limit of ${maxMb} MB.`,
      413,
      "FILE_TOO_LARGE",
    );
  }

  // 2. Filename sanitization to prevent Path Traversal
  const sanitizedFilename = sanitizeFilename(input.filename || "resume.txt");

  // 3. True MIME detection via magic bytes
  const detectedMimeType = detectMimeTypeFromBuffer(input.buffer, sanitizedFilename);

  // 4. Reject executable binaries explicitly
  if (detectedMimeType === "application/x-msdownload") {
    throw new AppError(
      "Executable binaries and script files are strictly prohibited.",
      415,
      "UNSUPPORTED_MEDIA_TYPE",
    );
  }

  // 5. Whitelist validation
  if (!ALLOWED_MIME_TYPES.includes(detectedMimeType)) {
    throw new AppError(
      `Unsupported file format (${detectedMimeType}). Supported formats are PDF (.pdf), Word (.docx), and Plain Text (.txt).`,
      415,
      "UNSUPPORTED_MEDIA_TYPE",
    );
  }

  return {
    buffer: input.buffer,
    sanitizedFilename,
    detectedMimeType,
    sizeBytes: input.buffer.length,
  };
}

export function selectResumeParser(
  buffer: Buffer,
  mimeType: string,
  filename?: string,
): ResumeFileParser {
  if (pdfParser.canParse(buffer, mimeType, filename)) {
    return pdfParser;
  }
  if (docxParser.canParse(buffer, mimeType, filename)) {
    return docxParser;
  }
  return textParser;
}

export async function extractTextFromResumeFile(input: {
  buffer: Buffer;
  filename?: string;
  declaredMimeType?: string;
}): Promise<ExtractedResumeText & { sanitizedFilename: string }> {
  const validated = validateResumeUpload(input);
  const parser = selectResumeParser(
    validated.buffer,
    validated.detectedMimeType,
    validated.sanitizedFilename,
  );

  const extracted = await parser.parse(validated.buffer);

  return {
    ...extracted,
    mimeType: validated.detectedMimeType,
    sanitizedFilename: validated.sanitizedFilename,
  };
}
