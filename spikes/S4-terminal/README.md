# S4 — Terminal (ConPTY + xterm.js in WebView2)

**Gate (docs/spec/07-roadmap.md, M0):** an interactive shell and a full-screen app (`docker exec -it … sh`, `vim`) render correctly.

**Status: code written and compiles on Linux; NOT yet run.** Nothing below has been observed on Windows.

## Why this is not the spec's first choice

The spec says to evaluate `Microsoft.Terminal.Wpf` first. **It cannot be used:** nuget.org lists a package "Microsoft.Terminal.Wpf 1.0" with no license metadata, and the `.nupkg` itself answers `404 BlobNotFound` (checked 2026-10-20). The spec's fallback is a custom VT renderer on top of a VT parser library, which is a large amount of work.

I am proposing a third route instead, recorded as ADR-013 (needs your approval): **xterm.js** (MIT; the engine behind VS Code's terminal) rendered inside **WebView2** (BSD-3 SDK; the runtime ships with Windows 11), fed by our own ConPTY wrapper (`spikes/Common/ConPtySession.cs`, the prototype of `ConPtyTerminalAdapter`). It gives full VT fidelity (alternate screen, 24-bit colour, mouse, search, WebGL rendering) for a few hundred lines. Cost: WebView2 processes use extra memory when a terminal is open (to be measured in M1 against the 250 MB idle budget).

If you prefer the pure-WPF custom renderer, say so before M1; this spike's ConPTY half is reusable either way.

## What it checks (`SelfTest.cs`) — by reading xterm.js's own buffer, not by eye

| Check | Needs | Gate |
|---|---|---|
| Interactive shell | — | `"NAUTIX-" + (6*7)` prints `NAUTIX-42` |
| Unicode | — | `é-ñ-日本-😀` round-trips |
| Resize | — | xterm.js → ConPTY: PowerShell reports `100x30` after resize |
| Theme | — | terminal background changes dark ↔ light from the `Nx.*` tokens |
| Full-screen app | `-Distro` (needs `vim-tiny`) | `vim` enters the alternate screen, shows `~` filler, `ihello-nautix` appears with `INSERT`, `:q!` returns to the shell |
| Flood | `-Distro` | `seq 1 300000` finishes ≤ 10 s and the page still answers in < 1 s |
| `docker exec -it` via the relay | `-DockerContext` (S3 first) | prompt appears, `echo $((6*7))` → 42, `stty size` → `28 90` after resize, `vi` renders and exits |

The last row is also S3's "`exec -it` interactive resize works" criterion.

## Run it (on your Windows machine)

```powershell
cd spikes\S4-terminal
.\fetch-assets.ps1     # one-time: downloads xterm.js, verifies pinned SHA-512 (the files are not committed)
.\run.ps1                                  # shell, unicode, resize, theme only
.\run.ps1 -Distro nautix-engine-spike -DockerContext nautix-spike     # after S3's provisioning, all checks
```

**Paste back:** the text the script prints (ends with `Exit code: N`) plus `results\vim.png`, `results\docker-exec-vi.png` and `results\final.png`. I will look for colour and glyph problems that the buffer checks cannot see.

## Known gaps

- Selection, copy/paste, search and font-size shortcuts are xterm.js defaults, not wired to Nautix commands.
- No scrollback persistence, no multi-tab.
- WebView2 on Windows 10 without the Evergreen runtime would fail to start (Windows 11 is our floor, so acceptable).
