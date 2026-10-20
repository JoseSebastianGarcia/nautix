/** One-time token printed in the server log on first run; required to create the admin. */
export abstract class SetupTokenStore {
  abstract current(): string | null;
  abstract consume(): void;
}
