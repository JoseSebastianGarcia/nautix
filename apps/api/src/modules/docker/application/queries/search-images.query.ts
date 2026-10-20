export class SearchImagesQuery {
  constructor(
    public readonly term: string,
    public readonly limit: number,
  ) {}
}
