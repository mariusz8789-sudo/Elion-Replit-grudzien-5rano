const DATA_URL_PATTERN = /^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);base64,([a-zA-Z0-9+/]+=*)$/;

interface DataUrlValidationOptions {
  allowedMimeTypes: readonly string[];
  maxBytes: number;
}

interface DataUrlValidationResult {
  mimeType: string;
  sizeBytes: number;
}

/**
 * Validates a base64 data: URL uploaded directly in a JSON request body (cargo photos,
 * verification documents, chat attachments): rejects anything that isn't a well-formed
 * data URL, isn't in the allowed MIME whitelist, or decodes to more than maxBytes.
 * Throws with a message safe to return to the client.
 */
export function validateDataUrl(raw: string, options: DataUrlValidationOptions): DataUrlValidationResult {
  const match = DATA_URL_PATTERN.exec(raw);
  if (!match) {
    throw new Error("File must be a base64-encoded data URL");
  }
  const [, mimeType, base64Body] = match;
  if (!options.allowedMimeTypes.includes(mimeType.toLowerCase())) {
    throw new Error(`Unsupported file type: ${mimeType}`);
  }
  // Decoded byte length from base64 length, without actually allocating the buffer.
  const padding = base64Body.endsWith("==") ? 2 : base64Body.endsWith("=") ? 1 : 0;
  const sizeBytes = (base64Body.length * 3) / 4 - padding;
  if (sizeBytes > options.maxBytes) {
    throw new Error(`File is too large (max ${Math.floor(options.maxBytes / 1024 / 1024)}MB)`);
  }
  return { mimeType: mimeType.toLowerCase(), sizeBytes: Math.round(sizeBytes) };
}
