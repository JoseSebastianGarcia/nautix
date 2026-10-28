/**
 * True when what was typed is the object's exact name, as GitHub asks before deleting a repository.
 * Spaces around the text are ignored; case is not, and an empty name never matches, so an empty field
 * can never unlock the button.
 */
export const nameMatches = (typed: string, expected: string): boolean =>
  expected !== "" && typed.trim() === expected;
