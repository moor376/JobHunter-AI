import { PDFParse } from "pdf-parse";
import { AppError } from "../../utils/app-error.js";
import type { ExtractedResumeText, ResumeFileParser } from "./types.js";

export class PdfResumeParser implements ResumeFileParser {
  public readonly supportedMimeTypes = ["application/pdf"];

  public canParse(buffer: Buffer, mimeType?: string, filename?: string): boolean {
    if (mimeType === "application/pdf") return true;
    if (filename && filename.toLowerCase().endsWith(".pdf")) return true;
    if (buffer.length >= 4 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
      return true;
    }
    return false;
  }

  public async parse(buffer: Buffer): Promise<ExtractedResumeText> {
    if (!buffer || buffer.length === 0) {
      throw new AppError("Uploaded PDF file buffer is empty.", 400, "EMPTY_FILE_BUFFER");
    }

    let parser: PDFParse | null = null;
    try {
      parser = new PDFParse({
        data: buffer,
        stopAtErrors: true,
        verbosity: 0,
        disableAutoFetch: true,
        disableStream: true,
      });

      // Execute extraction with safety timeout
      const parsePromise = parser.getText();
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("PDF parsing timed out")), 4000);
      });

      const textResult = await Promise.race([parsePromise, timeoutPromise]);
      const rawText = (textResult?.text || "").trim();

      if (!rawText) {
        throw new AppError(
          "PDF document contains no extractable text. Scanned image-only PDFs or empty files are not supported.",
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
        mimeType: "application/pdf",
        rawLength: buffer.length,
        pageCount: textResult.pages?.length || 1,
        metadata: {
          totalPages: textResult.pages?.length || 1,
        },
      };
    } catch (err: unknown) {
      if (err instanceof AppError) {
        throw err;
      }
      throw new AppError(
        "Corrupted or unreadable PDF document.",
        400,
        "CORRUPTED_PDF",
      );
    } finally {
      if (parser) {
        try {
          await parser.destroy();
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }
}
