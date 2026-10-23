# Contributing

Thank you for helping. Read `CLAUDE.md` (rules and conventions) and `docs/spec/` first; open an issue before a large change.

## Before you open a pull request

```bash
pnpm install
pnpm lint      # biome + layer rules + license check
pnpm test      # unit tests, no Docker needed
```

Every user-visible string goes through i18n (English and Spanish), colors and sizes come from CSS tokens (dark and light),
and a feature change updates its help topic in `apps/web/src/help/content/`.

## Contributor License Agreement

By submitting a contribution (code, documentation, translations, images) you confirm that:

1. You wrote it, or you have the right to submit it.
2. You license it to the project under the **Apache License 2.0** (as in `LICENSE`).
3. You also grant **Patterna** a perpetual, worldwide, non-exclusive, royalty-free, irrevocable right to use, modify,
   sublicense and **relicense** your contribution as part of Nautix, including in commercial or separately licensed
   editions. You keep the copyright on your contribution.

Add this line to your pull request description to accept: `I agree to the CONTRIBUTING.md contributor terms.`
Contributions without it cannot be merged. (Point 3 is what lets the project change its licensing in the future without
asking every contributor again.)

## Dependencies

Only MIT, Apache-2.0, BSD, ISC or MPL. No GPL, AGPL, SSPL or BUSL. `pnpm lint` checks it.
