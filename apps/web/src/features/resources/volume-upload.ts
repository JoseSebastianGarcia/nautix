/** The most the server accepts in one upload. */
export const MAX_UPLOAD_BYTES = 256 * 1024 * 1024;

/** A tar name field holds 100 bytes; a longer file name cannot be uploaded this way. */
const MAX_NAME_BYTES = 100;

export type UploadIssue = "tooLarge" | "nameTooLong";

/** Why these files cannot be uploaded, or null when they can. */
export const checkUpload = (
  files: readonly { name: string; size: number }[],
): UploadIssue | null => {
  if (files.some((f) => new TextEncoder().encode(f.name).length > MAX_NAME_BYTES))
    return "nameTooLong";
  if (files.reduce((total, f) => total + f.size, 0) > MAX_UPLOAD_BYTES) return "tooLarge";
  return null;
};

export const formatSize = (n: number): string =>
  n < 1024
    ? `${n} B`
    : n < 1024 * 1024
      ? `${(n / 1024).toFixed(1)} KB`
      : `${(n / 1024 / 1024).toFixed(1)} MB`;
