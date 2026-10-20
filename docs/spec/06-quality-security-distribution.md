# 06 — Quality, security, distribution

## Tests

| Layer | Tooling | Scope |
|---|---|---|
| Unit | xUnit v3 + Shouldly (verify licenses at M0; alt: AwesomeAssertions) | Domain, handlers (with fakes), MVU reducers, patches, parsers, lint rules |
| Property | FsCheck | YAML/Dockerfile patch invariants, layout determinism, state-history |
| Snapshot | Verify | Parser CST dumps, generated YAML/Dockerfile, CLI previews |
| Corpus | custom | Byte-exact round-trip for `corpus/compose` (≥ 200) and `corpus/dockerfile` (≥ 150) |
| Architecture | NetArchTest | Dependency rules from `01-architecture.md`; "no `System.Windows` outside Host/Ui"; "no I/O types in Domain/Application" |
| Integration | xUnit `[Trait("Category","Integration")]` | Real engine in `nautix-engine` on a Windows runner (self-hosted or `windows-2025` with WSL2 if available); relay, API adapter, compose, buildx |
| UI smoke | STA test host | Views load in both themes/languages, zero binding failures |
| Resource completeness | custom | i18n keys en/es, theme token parity, WCAG contrast of token pairs |
| Performance | BenchmarkDotNet + scripted scenarios | Layout 300 nodes, YAML patch latency (< 10 ms for 1000-line file), relay throughput, startup time (< 2 s to first paint) |
| Coverage | coverlet | ≥ 80% line on Domain/Application; no gate on views |

CI (GitHub Actions): `build` (windows-latest: restore, build -warnaserror, format check, unit + arch + resource tests) → `integration` (self-hosted Windows with WSL2, nightly + on `main`) → `package` (MSI + zip, signing step gated on secrets) → `release` (tag). Cache NuGet. Upload test results and the round-trip diff report as artifacts.

## Security requirements

1. **No network listeners.** Engine only via the per-user named pipe. A test enumerates `netstat`-equivalent listeners after provisioning and asserts none belong to Nautix or `nautix-engine` besides user-published container ports.
2. **Pipe ACL** restricted to the current user SID; test with a second user in integration (denied).
3. **Credentials**: Windows Credential Manager only; `docker login` uses `--password-stdin`; never plaintext in `config.json`. Decided (ADR-018): ship the upstream `docker-credential-wincred.exe` (MIT) and set `credsStore: "wincred"` in Nautix's `DOCKER_CONFIG`; the Credential Manager target is the registry URL, not `Nautix/registry/<host>`. Must be validated on a corporate laptop (application-control policies).
4. **Secrets in builds** (`--secret`) are passed by file/env at execution time and never persisted in history.
5. **Destructive confirmations** through `IConfirmationPolicy`; "Don't ask again" allowed only for non-destructive operations.
6. **Privileged requests** (privileged containers, host network, mounting `/`, `docker.sock`, `--cap-add=SYS_ADMIN`, `--security-opt apparmor=unconfined`) show a security warning dialog with the specific risk.
7. **Mount safety**: bind-mount dialogs warn about Windows paths (performance, permissions) and about mounting `C:\` or user profile root.
8. **Supply chain**: pinned engine rootfs SHA-256 verified at install; docker/compose/buildx binaries downloaded from official release URLs with checksum verification (checksums committed in `build/checksums.json`); all NuGet via central package management with lock files (`RestorePackagesWithLockFile`); `dotnet list package --vulnerable` in CI fails on High/Critical.
9. **Updates**: installer/update packages signed (Authenticode, timestamped); update manifest signed; refuse unsigned or downgrade.
10. **Telemetry**: off by default; opt-in; anonymous counters only (feature use, error codes); documented in `docs/PRIVACY.md`; no image names, paths, env values, or hostnames.
11. **Logs** redact: env values (keep names), registry auth, tokens, `Authorization` headers. Unit test with seeded secrets.
12. **Least privilege**: app runs unelevated. Elevation only in a separate helper (`Nautix.Installer` custom action / `nautix-elevate.exe`) for enabling Windows features, with a clear UAC reason string.
13. **WSL isolation** in the engine distro: `interop` and Windows drive automount disabled (see `02-engine.md`) so containers/engine cannot reach the host filesystem except through explicit bind mounts handled via Nautix (`\\wsl$` / `/mnt` strategy decided at M1: explicit per-path mounts).

## Installer and lifecycle

- **MSI** with WiX v5 (MS-RL accepted as a build-time-only exception, ADR-003), per-user install (`%LocalAppData%\Programs\Nautix`) by default; per-machine optional. UI languages en-US/es-ES. Signed.
- First run launches the **provisioning wizard** (same steps as `02-engine.md`), resumable after reboot. Modes: *Full* (engine + tools + context) and *Client only* (skip engine/WSL changes; just tools and context management) for corporate environments.
- Uninstall: removes app, relay task, PATH entry; asks whether to delete the engine distro and data (default: keep data, offer export).
- Auto-update: check on launch + every 24 h against GitHub Releases manifest (signed); apply on next restart; rollback to previous version on failed start (2 consecutive crashes within 60 s).
- Crash reporting: local crash dumps to `%LocalAppData%\Nautix\crashes`, "Copy diagnostic bundle" (zip: logs, versions, engine info, redacted settings) — user-initiated only.
- Winget manifest (`patterna.Nautix`) and GitHub Releases as distribution; Microsoft Store is out of scope.

## Repository hygiene

`README.md` (en), `README.es.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md` (private disclosure), `LICENSE` (MIT), `THIRD_PARTY_NOTICES.md` (generated in CI from NuGet licenses; fail on unknown/incompatible), issue/PR templates, `docs/DECISIONS.md` (ADRs), `docs/PRIVACY.md`.

Trademark note: "Docker" is a trademark of Docker, Inc. Product copy must say "compatible with Docker Engine" / "for Docker"; never imply affiliation. Check "Nautix" availability (domain, USPTO/EUIPO) before first public release and record the result in DECISIONS.
