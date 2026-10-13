/**
 * Attachment rules shared by the Parent excuse-letter modal and its API route.
 * Some Windows browsers identify Office files as application/octet-stream (or
 * no MIME type at all), so a known extension is used only for that fallback.
 */
export const MAX_EXCUSE_LETTER_ATTACHMENT_BYTES = 5 * 1024 * 1024;

type AttachmentFormat = {
  mimeType: string;
  extensions: readonly string[];
  mimeAliases: readonly string[];
};

const ATTACHMENT_FORMATS: readonly AttachmentFormat[] = [
  { mimeType: "image/jpeg", extensions: ["jpg", "jpeg"], mimeAliases: ["image/jpeg"] },
  { mimeType: "image/png", extensions: ["png"], mimeAliases: ["image/png"] },
  { mimeType: "image/webp", extensions: ["webp"], mimeAliases: ["image/webp"] },
  { mimeType: "application/pdf", extensions: ["pdf"], mimeAliases: ["application/pdf"] },
  {
    mimeType: "application/msword",
    extensions: ["doc"],
    mimeAliases: ["application/msword", "application/vnd.ms-word", "application/x-msword"],
  },
  {
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extensions: ["docx"],
    mimeAliases: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  },
];

const GENERIC_BINARY_MIME_TYPES = new Set(["", "application/octet-stream", "application/zip", "application/x-zip-compressed"]);

export const EXCUSE_LETTER_FILE_INPUT_ACCEPT = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".pdf",
  ".doc",
  ".docx",
].join(",");

type AttachmentMetadata = {
  file_name: string;
  file_type: string;
};

export type ExcuseLetterAttachmentValidation =
  | { ok: true; attachment: AttachmentMetadata }
  | { ok: false; message: string };

export type ExcuseLetterAttachmentPayloadValidation =
  | { ok: true; attachment: AttachmentMetadata & { file_data: string } }
  | { ok: false; message: string };

function extensionOf(fileName: string) {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 && dot < fileName.length - 1 ? fileName.slice(dot + 1).toLowerCase() : "";
}

function formatForExtension(extension: string) {
  return ATTACHMENT_FORMATS.find((format) => format.extensions.includes(extension));
}

function formatForMimeType(mimeType: string) {
  return ATTACHMENT_FORMATS.find((format) => format.mimeAliases.includes(mimeType));
}

/**
 * Validates a browser File's metadata or a received attachment payload. The
 * extension fallback is intentionally limited to generic MIME types; a known
 * mismatched MIME type remains rejected.
 */
export function validateExcuseLetterAttachmentMetadata(
  rawFileName: unknown,
  rawMimeType: unknown,
  byteLength: number,
): ExcuseLetterAttachmentValidation {
  const fileName = typeof rawFileName === "string" ? rawFileName.trim() : "";
  const mimeType = typeof rawMimeType === "string" ? rawMimeType.trim().toLowerCase() : "";

  if (!fileName || fileName.length > 180) {
    return { ok: false, message: "The attachment file name is invalid." };
  }
  if (!Number.isSafeInteger(byteLength) || byteLength <= 0 || byteLength > MAX_EXCUSE_LETTER_ATTACHMENT_BYTES) {
    return { ok: false, message: "Each attachment must be 5 MB or smaller." };
  }

  const byExtension = formatForExtension(extensionOf(fileName));
  const byMimeType = formatForMimeType(mimeType);
  if (byExtension && byMimeType && byExtension.mimeType !== byMimeType.mimeType) {
    return { ok: false, message: "The attachment file type does not match its extension." };
  }

  const format = byMimeType ?? (GENERIC_BINARY_MIME_TYPES.has(mimeType) ? byExtension : undefined);
  if (!format) {
    return { ok: false, message: "Use JPG, PNG, WEBP, PDF, DOC, or DOCX files only." };
  }

  return { ok: true, attachment: { file_name: fileName, file_type: format.mimeType } };
}

function isBase64(value: string) {
  return value.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(value);
}

function base64ByteLength(value: string) {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return (value.length / 4) * 3 - padding;
}

/** Validates the serialized base64 payload before it is persisted. */
export function validateExcuseLetterAttachmentPayload(value: unknown): ExcuseLetterAttachmentPayloadValidation {
  const candidate = value as { file_name?: unknown; file_type?: unknown; file_data?: unknown } | null;
  const fileData = typeof candidate?.file_data === "string" ? candidate.file_data : "";
  if (!isBase64(fileData)) {
    return { ok: false, message: "The attachment is not valid base64 data." };
  }

  const metadata = validateExcuseLetterAttachmentMetadata(candidate?.file_name, candidate?.file_type, base64ByteLength(fileData));
  if (!metadata.ok) return metadata;
  return { ok: true, attachment: { ...metadata.attachment, file_data: fileData } };
}
