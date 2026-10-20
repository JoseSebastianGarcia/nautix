/** Answers "is this the container that runs Nautix?" so it can protect itself. */
export abstract class SelfIdentity {
  abstract matches(container: { id: string; name: string }): boolean;
}
