export class BrowseVolumeQuery {
  constructor(
    readonly volume: string,
    readonly path: string,
    readonly view: boolean,
  ) {}
}
