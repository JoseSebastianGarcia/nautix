export interface StoredZone {
  yaml: string;
  appliedAt: number;
}

/** The desired spec of each zone as last applied (the reference drift is measured against). */
export abstract class ZoneStore {
  abstract get(zone: string): Promise<StoredZone | null>;
  abstract save(zone: string, yaml: string): Promise<void>;
  abstract names(): Promise<string[]>;
}
