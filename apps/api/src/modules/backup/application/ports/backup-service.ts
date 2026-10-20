export interface RestoreSummary {
  files: string[];
  createdAt: string | null;
}

/** Backs up and restores everything Nautix keeps in its data directory. */
export abstract class BackupService {
  /** Consistent copy of the database plus the encryption key and certificates. */
  abstract create(): Promise<Buffer>;
  /** Validates the archive and stages it; it replaces the live data on the next start. */
  abstract stageRestore(archive: Buffer): Promise<RestoreSummary>;
}

/** Restarts the process after a restore (the container's restart policy brings it back). */
export abstract class Restarter {
  abstract restartSoon(): void;
}
