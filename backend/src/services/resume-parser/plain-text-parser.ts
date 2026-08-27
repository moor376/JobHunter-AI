import { AppError } from "../../utils/app-error.js";
import type { ExtractedResumeText, ResumeFileParser } from "./types.js";

export class PlainTextResumeParser implements ResumeFileParser {
  public readonly supportedMimeTypes = ["text/plain", "text/markdown", "text/csv"];

  public canParse(buffer: Buffer, mimeType?: string, filename?: string): boolean {
    if (mimeType && this.supportedMimeTypes.includes(mimeType)) return true;
    if (filename && (filename.toLowerCase().endsWith(".txt") || filename.toLowerCase().endsWith(".md"))) {
      return true;
    }
    return true; // Default fallback for text buffers
  }

  public async parse(buffer: Buffer): Promise<ExtractedResumeText> {
    if (!buffer || buffer.length === 0) {
      throw new AppError("Uploaded text resume buffer is empty.", 400, "EMPTY_FILE_BUFFER");
    }

    const text = buffer.toString("utf-8").trim();
    if (!text) {
      throw new AppError("Text resume is empty.", 422, "EMPTY_RESUME_TEXT");
    }

    const normalizedText = text
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return {
      text: normalizedText,
      mimeType: "text/plain",
      rawLength: buffer.length,
      pageCount: 1,
    };
  }
}
