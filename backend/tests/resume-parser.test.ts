import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { DocxResumeParser } from "../src/services/resume-parser/docx-parser.js";
import { detectMimeTypeFromBuffer, sanitizeFilename } from "../src/services/resume-parser/magic-bytes.js";
import { PdfResumeParser } from "../src/services/resume-parser/pdf-parser.js";
import { PlainTextResumeParser } from "../src/services/resume-parser/plain-text-parser.js";
import { extractTextFromResumeFile, validateResumeUpload } from "../src/services/resume-parser/resume-file-parser.js";
import { memoryStore } from "../src/store/db-store.js";

// Minimal valid PDF with searchable text stream
const validPdfString = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 120 >>
stream
BT
/F1 12 Tf
72 712 Td
(Nayera Tarek Mohamed - Senior Banking Telesales Specialist SAIB Bank ADIB Bank ABK Cairo Law) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000224 00000 n 
0000000394 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
471
%%EOF`;

const validPdfBuffer = Buffer.from(validPdfString, "utf-8");

describe("Binary Resume Parsing Engine", () => {
  describe("Magic Bytes & Filename Sanitization", () => {
    it("detects PDF MIME type correctly from PDF header", () => {
      const mime = detectMimeTypeFromBuffer(validPdfBuffer);
      expect(mime).toBe("application/pdf");
    });

    it("detects plain text MIME type correctly", () => {
      const textBuf = Buffer.from("Nayera Tarek Mohamed Banking CV", "utf-8");
      const mime = detectMimeTypeFromBuffer(textBuf, "resume.txt");
      expect(mime).toBe("text/plain");
    });

    it("identifies and rejects executable binary files (PE/EXE)", () => {
      const exeBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);
      const mime = detectMimeTypeFromBuffer(exeBuffer, "malicious.exe");
      expect(mime).toBe("application/x-msdownload");

      expect(() => {
        validateResumeUpload({ buffer: exeBuffer, filename: "malicious.exe" });
      }).toThrowError(/Executable binaries and script files are strictly prohibited/);
    });

    it("sanitizes filenames to prevent Path Traversal attacks", () => {
      const dangerous1 = "../../../../../etc/passwd";
      const dangerous2 = "..\\..\\windows\\system32\\cmd.exe.pdf";

      expect(sanitizeFilename(dangerous1)).toBe("passwd");
      expect(sanitizeFilename(dangerous2)).toBe("cmd.exe.pdf");
    });
  });

  describe("PdfResumeParser", () => {
    const parser = new PdfResumeParser();

    it("identifies PDF buffer capability", () => {
      expect(parser.canParse(validPdfBuffer, "application/pdf")).toBe(true);
      expect(parser.canParse(Buffer.from("text"), "text/plain")).toBe(false);
    });

    it("extracts text from a valid binary PDF document", async () => {
      const result = await parser.parse(validPdfBuffer);
      expect(result.mimeType).toBe("application/pdf");
      expect(result.text).toContain("Nayera Tarek Mohamed");
      expect(result.text).toContain("Senior Banking Telesales Specialist");
      expect(result.pageCount).toBeGreaterThanOrEqual(1);
    });

    it("handles corrupted PDF buffer gracefully with a typed AppError", async () => {
      const corruptedPdf = Buffer.from("%PDF-1.4\nCorrupted content without xref or objects\n%%EOF");
      await expect(parser.parse(corruptedPdf)).rejects.toThrowError(
        /Corrupted or unreadable PDF document|PDF document contains no extractable text/,
      );
    });

    it("rejects empty buffer with a client error", async () => {
      await expect(parser.parse(Buffer.alloc(0))).rejects.toThrowError(
        /buffer is empty/,
      );
    });
  });

  describe("DocxResumeParser", () => {
    const parser = new DocxResumeParser();

    it("identifies DOCX buffer capability", () => {
      const zipBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
      expect(parser.canParse(zipBuffer, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "cv.docx")).toBe(true);
    });

    it("rejects corrupted DOCX buffer with a typed AppError", async () => {
      const corruptedDocx = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x08, 0x00]);
      await expect(parser.parse(corruptedDocx)).rejects.toThrowError(
        /Corrupted or invalid DOCX document/,
      );
    });

    it("rejects empty DOCX buffer with a client error", async () => {
      await expect(parser.parse(Buffer.alloc(0))).rejects.toThrowError(
        /buffer is empty/,
      );
    });
  });

  describe("PlainTextResumeParser", () => {
    const parser = new PlainTextResumeParser();

    it("extracts text from plain text buffer", async () => {
      const textBuffer = Buffer.from("Nayera Tarek Mohamed\nBanking Sales Specialist\nSAIB Bank", "utf-8");
      const result = await parser.parse(textBuffer);
      expect(result.mimeType).toBe("text/plain");
      expect(result.text).toContain("Nayera Tarek Mohamed");
    });

    it("rejects empty text buffer", async () => {
      await expect(parser.parse(Buffer.alloc(0))).rejects.toThrowError(
        /buffer is empty/,
      );
    });
  });

  describe("Upload Validation & File Size Limits", () => {
    it("rejects file exceeding MAX_RESUME_SIZE_BYTES", () => {
      const largeBuffer = Buffer.alloc(6 * 1024 * 1024); // 6MB
      largeBuffer[0] = 0x25;
      largeBuffer[1] = 0x50;
      largeBuffer[2] = 0x44;
      largeBuffer[3] = 0x46; // %PDF-

      expect(() => {
        validateResumeUpload({ buffer: largeBuffer, filename: "large.pdf" });
      }).toThrowError(/exceeds maximum allowed limit/);
    });

    it("rejects unsupported media formats like raw binary data", () => {
      const binaryBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG signature
      expect(() => {
        validateResumeUpload({ buffer: binaryBuf, filename: "image.png" });
      }).toThrowError(/Unsupported file format/);
    });
  });

  describe("End-to-End API Integration with Base64 PDF Upload", () => {
    let server: Server;
    let baseUrl: string;

    beforeEach(async () => {
      server = createServer(createApp());
      await new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", resolve);
      });
      const addr = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}`;
    });

    afterEach(async () => {
      if (server) {
        await new Promise<void>((resolve, reject) => {
          server.close((err) => (err ? reject(err) : resolve()));
        });
      }
    });

    it("successfully uploads Base64 PDF, parses text, and runs AI extractor into structured facts", async () => {
      const candidate = Array.from(memoryStore.candidates.values())[0];
      const base64Pdf = validPdfBuffer.toString("base64");

      const response = await fetch(`${baseUrl}/api/candidates/${candidate.id}/resumes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalFilename: "Nayera_Official_CV_2026.pdf",
          fileBase64: base64Pdf,
          mimeType: "application/pdf",
          source: "USER_UPLOAD",
        }),
      });

      expect(response.status).toBe(201);
      const data = (await response.json()) as any;
      expect(data.data.candidateId).toBe(candidate.id);
      expect(data.data.parseStatus).toBe("COMPLETED");
      expect(data.data.originalFilename).toBe("Nayera_Official_CV_2026.pdf");
      expect(["Nayera", "نيرة"]).toContain(data.data.parsedData.firstName);
      expect(data.data.parsedData.skills.length).toBeGreaterThan(0);
      expect(data.data.sourceMetadata.mimeType).toBe("application/pdf");
    });
  });
});
