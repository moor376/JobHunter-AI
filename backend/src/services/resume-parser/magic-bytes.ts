export function detectMimeTypeFromBuffer(buffer: Buffer, declaredFilename?: string): string {
  if (buffer.length < 4) {
    return "application/octet-stream";
  }

  // 1. Executable check (Security rejection)
  if (
    (buffer[0] === 0x4d && buffer[1] === 0x5a) || // MZ (Windows PE/EXE/DLL)
    (buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) // ELF
  ) {
    return "application/x-msdownload";
  }

  // 2. PDF check: %PDF- (0x25 0x50 0x44 0x46 0x2D)
  if (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return "application/pdf";
  }

  // 3. ZIP / DOCX check: PK\x03\x04 (0x50 0x4B 0x03 0x04)
  if (
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  ) {
    // If filename ends in .docx, or contains docx structure
    const lowerFilename = (declaredFilename || "").toLowerCase();
    if (lowerFilename.endsWith(".docx")) {
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }
    // Generic zip or docx
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }

  // 4. Check if text/plain (no null bytes in sample header and valid UTF-8/ASCII)
  const sampleLength = Math.min(buffer.length, 512);
  let isText = true;
  for (let i = 0; i < sampleLength; i++) {
    const byte = buffer[i];
    // Reject null byte or control characters other than tab, CR, LF
    if (byte === 0 || (byte < 7 && byte !== 0) || (byte > 14 && byte < 32 && byte !== 27)) {
      isText = false;
      break;
    }
  }

  if (isText) {
    return "text/plain";
  }

  return "application/octet-stream";
}

export function sanitizeFilename(filename: string): string {
  // Prevent Path Traversal by removing path delimiters and dots
  const baseName = filename.replace(/^.*[\\/]/, "");
  // Replace disallowed characters with safe alphanumeric or dash/underscore
  const cleanName = baseName.replace(/[^a-zA-Z0-9._-]/g, "_");
  // Limit length
  return cleanName.slice(0, 150) || "uploaded-resume.txt";
}
