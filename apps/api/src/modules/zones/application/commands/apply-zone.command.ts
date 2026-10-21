export class ApplyZoneCommand {
  constructor(
    readonly zone: string,
    readonly spec: string,
    readonly planHash: string,
    readonly allowRemovals: boolean,
  ) {}
}
