export interface ExtractedResumeText {
  text: string;
  mimeType: string;
  rawLength: number;
  pageCount?: number;
  metadata?: Record<string, unknown>;
}

export interface ResumeFileParser {
  readonly supportedMimeTypes: string[];
  canParse(buffer: Buffer, mimeType?: string, filename?: string): boolean;
  parse(buffer: Buffer): Promise<ExtractedResumeText>;
}

export interface ValidatedResumeFile {
  buffer: Buffer;
  sanitizedFilename: string;
  detectedMimeType: string;
  sizeBytes: number;
}
