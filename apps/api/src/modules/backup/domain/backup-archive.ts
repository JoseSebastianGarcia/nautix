import { gunzipSync, gzipSync } from "node:zlib";
import { ValidationError } from "../../../shared/domain-error.js";

/** Files a backup may hold, relative to the data directory. Anything else is refused on restore. */
const ALLOWED =
  /^(nautix\.db|\.key|tls\/(ca|ca-key|cert|key|custom-cert|custom-key)\.pem|tls\/hosts\.json)$/;
const FORMAT = "nautix-backup";
export const MAX_RESTORED_BYTES = 512 * 1024 * 1024;

interface Manifest {
  format: typeof FORMAT;
  version: 1;
  createdAt: string;
  files: Record<string, string>;
}

export const isBackupPath = (path: string): boolean => ALLOWED.test(path);

/** gzip(JSON) with every file base64-encoded: one small, dependency-free container. */
export const packBackup = (files: Record<string, Buffer>, now = new Date()): Buffer => {
  const manifest: Manifest = {
    format: FORMAT,
    version: 1,
    createdAt: now.toISOString(),
    files: Object.fromEntries(
      Object.entries(files).map(([path, data]) => [path, data.toString("base64")]),
    ),
  };
  return gzipSync(Buffer.from(JSON.stringify(manifest)));
};

export const unpackBackup = (archive: Buffer): Record<string, Buffer> => {
  let manifest: Manifest;
  try {
    manifest = JSON.parse(
      gunzipSync(archive, { maxOutputLength: MAX_RESTORED_BYTES * 2 }).toString("utf8"),
    ) as Manifest;
  } catch {
    throw new ValidationError("not a Nautix backup", "errors.backupInvalid");
  }
  if (manifest.format !== FORMAT || manifest.version !== 1 || typeof manifest.files !== "object")
    throw new ValidationError("not a Nautix backup", "errors.backupInvalid");
  const out: Record<string, Buffer> = {};
  let total = 0;
  for (const [path, b64] of Object.entries(manifest.files)) {
    if (!isBackupPath(path) || typeof b64 !== "string")
      throw new ValidationError(`unexpected file in backup: ${path}`, "errors.backupInvalid");
    const data = Buffer.from(b64, "base64");
    total += data.length;
    if (total > MAX_RESTORED_BYTES)
      throw new ValidationError("backup too large", "errors.backupInvalid");
    out[path] = data;
  }
  if (!out["nautix.db"])
    throw new ValidationError("backup has no database", "errors.backupInvalid");
  return out;
};
