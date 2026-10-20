# S5 — Editor (AvalonEdit)

**Question:** can AvalonEdit give us YAML highlighting, diagnostic squiggles and folding that follow our dark/light tokens, fast enough on large files? (The alternative, Monaco in WebView2, is only considered if this fails: docs/spec/03-ui-wpf.md.)

**Status: code written and compiles on Linux; NOT yet run.** WPF cannot run here, so every number below is pending your run.

## What it checks (`SelfTest.cs`)

| Check | Gate |
|---|---|
| Highlighting | Key, comment (full-line and trailing), alias, literal tokens each get the colour of the matching token, verified through AvalonEdit's own `DocumentHighlighter` |
| Folding | 9 folds in the sample; folding `services:` reduces the visible lines |
| Squiggles | 2 floating-tag warnings on the valid sample (2 segments really drawn), exactly 1 syntax error on the broken sample, reported on line 4 or 5 |
| Theme switch | Editor background and highlighting key colour both change at runtime between dark and light |
| Performance (5000 lines) | typing latency p95 ≤ 50 ms (insert a char → layout done, 40 samples), analysis (YAML parse + diagnostics + folding) ≤ 250 ms |

These gates are mine (the roadmap lists S5 without numbers); say so if you want different ones. Colours come from `Nautix.Ui.Wpf` token dictionaries, so this also exercises `ThemeManager` + `WpfThemeApplier` on a real window for the first time.

## Run it (on your Windows machine)

```powershell
cd spikes\S5-editor
.\run.ps1
```

**Paste back:** the text the script prints (it ends with `Exit code: N`) and the screenshots in `spikes\S5-editor\results\` (`theme-dark.png`, `theme-light.png`, `squiggles-warnings.png`, `squiggles-error.png`). Run it plugged in; the report records the CPU/GPU/display and whether you were on AC power.

## Known gaps (by design in a spike)

- Fold margin and tooltips use AvalonEdit defaults, not tokens.
- Diagnostics run synchronously on the UI thread; production runs them off-thread with the 250 ms debounce already implemented here.
- Highlighting rules are per-line regex: multi-line block scalars (`|`, `>`) are not coloured as strings.
- Spike UI strings are hard-coded English; the `NoHardcodedText` rule applies to `src/`, not to spikes.
