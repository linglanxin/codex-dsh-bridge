# Changelog

## 0.2.1-rc2 — 2026-10-18

- Add support for DSH Desktop 0.2.1-rc.2 / Cordis 4.0.5 / Schemastery 3.18.5.
- Pin development dependencies to the rc.2 release and retain compatibility with 0.2.0-rc.2 and 0.2.1-rc.1.
- Extend version checks for mixed core packages and keep task, permission and cancellation behavior unchanged.
- Update plugin metadata, setup diagnostics and distribution archives.

## 0.2.1 — 2026-10-17

- Support DSH Desktop 0.2.0-rc.2 / Cordis 4.0.4 and 0.2.1-rc.1 / Cordis 4.0.5, with matching core packages and Schemastery versions.
- Detect Host package versions through `pluginPackages` and report the connected version in setup and connection diagnostics.
- Add per-agent `tools.guard()` checks alongside execution hooks.
- Extend regression coverage for permissions, cancellation, deadlines and plugin lifecycle; add an isolated compatibility test runner.
- Add README icons and reorganize English and Chinese installation, usage and troubleshooting guides.
- Provide Codex plugin, Desktop adapter and source archives with SHA-256 checksums.

## 0.2.0 — 2026-10-17

- Add a portable Codex plugin, local marketplace and bundled MCP launcher.
- Add `dsh_setup_info` and repeatable setup with default configuration discovery.
- Stage the Desktop adapter in persistent private storage.
- Include dependency notices and distribution archives with checksums.

## 0.1.0 — 2026-10-17

- Add MCP stdio and an authenticated Unix socket bridge for DSH Desktop 0.2.0-rc.2.
- Add isolated sessions/worktrees, task submission, follow-ups, polling, results and cooperative cancellation.
- Enforce a default-deny tool policy and retained request deduplication.
- Add tests, bilingual setup guides, source references and security documentation.
