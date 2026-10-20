export class ExportComposeQuery {
  constructor(
    /** Network id to limit the export to one box; undefined exports everything. */
    public readonly networkId: string | undefined,
    public readonly includeEnv: boolean,
  ) {}
}
