# S1 — Compose round-trip

**Gate (docs/spec/07-roadmap.md, M0):** no-op edit and single-key edit are byte-exact on ≥ 98% of a 50-file corpus; remaining cases understood and listed.
**Result: PASS — 67/67 real files (100%), 16/16 synthetic edge cases.** Decision: ADR-011 (YamlDotNet events + marks, patch-based, no custom CST for M3 start).

## What was built

A position-aware, comment-preserving patcher shaped like `IYamlDocumentStore` (docs/spec/04-editors.md):

| Piece | File |
|---|---|
| Lossless-position syntax tree from YamlDotNet parser events and their marks | `Yaml/YamlTreeParser.cs` |
| `Parse` / `ToPatch` / `Apply`, edits `SetScalar`, `AddKey`, `RemoveKey`, `AppendItem`, `NoOp` | `Editing/YamlDocumentStore.cs` |
| Independent checks (below) and the gate report | `Verification/` |
| Corpus manifest + sha256-verified downloader | `Corpus/` |

The tree stores **only positions**, never re-serializes: every edit is one contiguous `TextPatch(start, length, replacement)`, so bytes outside the patch are untouched by construction. Comments, key order, quoting, blank lines, anchors and CRLF therefore survive; what can go wrong is *where* the patch lands.

## What was measured, and how

**Corpus.** 67 real `compose.yaml` files from 24 repositories (docker/awesome-compose, Supabase, Sentry, Appwrite, Mastodon, Immich, Superset, Airflow, Kong, Bitnami, …), 2.0 kLOC max, each pinned by sha256 in `corpus/compose/manifest.json`. They are **not committed** (licenses range from CC0 to AGPL/BUSL; ADR-012); run `fetch` to download. Plus 16 hand-written edge cases in `corpus/compose/synthetic/` (anchors/merge keys, flow style, CRLF, mixed EOL, tabs, BOM, no final newline, emoji, multi-doc, literal/folded blocks, indentless sequences, odd indents, empty values, explicit `? ` keys and tags).

**Per file** (`RoundTripRunner`):
1. Bytes → strict UTF-8 → bytes is identical (BOM, CRLF preserved).
2. **No-op**: `Apply(text, ToPatch(NoOp)) == text`. *Honest note:* with a patch design this is true by construction; it is reported because the spec asks for it, but it proves little.
3. **Mark fidelity**: every node span points at what it claims (quotes delimited, flow brackets, block header, alias `*`, plain value equals span).
4. **Single-key edits**, up to 3 sites (first/middle/last candidate) for each of 4 kinds → ~11 edits per file. For each edit:
   - **Semantic oracle** (`RepresentationOracle`): apply the same logical edit to YamlDotNet's *representation model* of the original, parse the patched text, require identical trees (values, order, anchors, alias sharing). It uses no positions, so it cannot share a bug with the patcher.
   - **Diff-range assertion** (`LineDiff`): lines changed in the text are exactly the key's lines (replace: inside the scalar's lines; add/append: one inserted line inside the container; remove: exactly the key + its value's lines).
   - Patched text re-parses and its marks are still faithful.

A file passes only if all of the above hold for all its edits.

## Results

Run on 2026-10-20, SDK 10.0.113, Linux, YamlDotNet 18.1.0.

| Set | Files | Pass | Edits (pass / not-applicable / fail) |
|---|---|---|---|
| Real-world (gate) | 67 | **67 (100%)** | add-key 201/0/0 · append-item 180/0/0 · remove-key 184/0/0 · set-scalar 200/0/0 (765 total) |
| Synthetic | 16 | 16 | add-key 48 · append-item 15 · remove-key 39 · set-scalar 47 (149 total), 0 failures |

No-op / byte round-trip: 67/67. Latency p95 (200 runs): parse of the largest real file (2002 lines) 5.8–7.1 ms; synthetic 1000-line file parse 3.5–3.9 ms; **patch + apply 0.02–0.19 ms** (spec target: < 10 ms).

**Not a clean first run — disclosure.** The first run scored 66/67 real (98.5%, already passing) and 13/16 synthetic. The three synthetic failures and the one real failure were genuine patcher bugs, fixed in general ways and now pinned by unit tests: (1) a leading BOM counted as one column of indentation; (2) a mapping whose first key is an explicit `? ` key took its indentation from the key's position, not the margin; (3) removing the last key of a file without final newline left a final newline behind. Because the corpus drove those fixes, treat the 100% as "no known failures", not as an unbiased held-out estimate for those bug classes. M3 grows the corpus to ≥ 200 files precisely for this.

**Are the checks able to fail?** `FaultInjectionTests` corrupts correct patches (off-by-one start, wrong indent, over-deletion, wrong value, no-op, syntax breakage, insertion in the wrong place, blank line left after a removal, skewed marks) and requires the checker to flag each. Two of my first injections were *not* faults: shifting a deletion by one character inside a run of identical spaces yields the same text. Worth remembering when reading "byte-exact" claims.

## Limitations — understood and listed

| Case | Status |
|---|---|
| Add / append / remove inside **flow** collections (`{}` / `[]`) | Not implemented → `edit.not_applicable.flow_collection`. Replacing a scalar inside flow works. 27/67 real files contain flow collections; they pass because sites are chosen only where the edit is implemented. M3 must implement them. |
| Editing **block scalars** (`\|`, `>`) and multi-line quoted/plain scalars | Not implemented (`block_scalar`, `multiline_scalar`). |
| Editing a value that is an **alias** (`*x`) or inherited via `<<` | Reported (`alias`); the "Edit anchor / Override here" flow is M3. |
| **Empty/null values** (`key:`) as edit targets | No span to replace (`empty_value`). |
| Removing a key that shares its line with `- ` | `shares_line`. Removing the only entry of a mapping | `only_entry`. |
| Mappings with only explicit `? ` keys | `no_standalone_key`. |
| Insertion after a `\|+` block with trailing blank lines | Goes after the blanks (keeps the block's content intact). |
| Key rename, reorder, duplicate keys (first wins), comment-level edits | Out of S1 scope. |
| Non-UTF-8 files | Reported as unparsable, not guessed. |

**Corpus representativeness.** The real files come from public, well-maintained projects: only **1 of 67 uses CRLF** and none has a BOM or tabs — the cases most likely for Windows-authored files, which is this product's audience. Synthetic files cover them, but real ones would be better: **drop 5–10 of your own compose files (especially from Windows editors) into `corpus/compose/local/`** (git-ignored; not yet wired into the runner — I'll add it if you want).

Real-corpus feature counts: anchors 8, merge keys 7, aliases 7, flow collections 27, block scalars 5, multi-doc 2, no final newline 2, CRLF 1, comments 41, `x-` extensions 8, non-ASCII 3.

## How to run

```powershell
dotnet run --project spikes/S1-compose-roundtrip -- fetch    # downloads + verifies the 67 pinned files into corpus/compose/downloaded/
dotnet run --project spikes/S1-compose-roundtrip -- run      # prints the table above; exit code 1 if the gate fails
dotnet test --filter "FullyQualifiedName~Nautix.Spikes.S1"   # unit, golden-output, synthetic-corpus and fault-injection tests
```

`fetch` reports `DRIFT` if upstream changed a file (hash mismatch): the file is not saved and `run` excludes it and says so. Re-pin deliberately by regenerating the manifest.
