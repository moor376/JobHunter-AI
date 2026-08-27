import mammoth from "mammoth";
import { AppError } from "../../utils/app-error.js";
import type { ExtractedResumeText, ResumeFileParser } from "./types.js";

export class DocxResumeParser implements ResumeFileParser {
  public readonly supportedMimeTypes = [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
  ];

  public canParse(buffer: Buffer, mimeType?: string, filename?: string): boolean {
    if (
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      mimeType === "application/msword"
    ) {
      return true;
    }
    if (filename && (filename.toLowerCase().endsWith(".docx") || filename.toLowerCase().endsWith(".doc"))) {
      return true;
    }
    if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
      return true;
    }
    return false;
  }

  public async parse(buffer: Buffer): Promise<ExtractedResumeText> {
    if (!buffer || buffer.length === 0) {
      throw new AppError("Uploaded DOCX file buffer is empty.", 400, "EMPTY_FILE_BUFFER");
    }

    try {
      const result = await mammoth.extractRawText({ buffer });
      const rawText = (result?.value || "").trim();

      if (!rawText) {
        throw new AppError(
          "DOCX document contains no readable text.",
          422,
          "EMPTY_RESUME_TEXT",
        );
      }

      // Normalize line breaks and spaces
      const normalizedText = rawText
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      return {
        text: normalizedText,
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        rawLength: buffer.length,
        metadata: {
          messagesCount: result.messages?.length || 0,
        },
      };
    } catch (err: unknown) {
      if (err instanceof AppError) {
        throw err;
      }
      throw new AppError(
        "Corrupted or invalid DOCX document.",
        400,
        "CORRUPTED_DOCX",
      );
    }
  }
}
