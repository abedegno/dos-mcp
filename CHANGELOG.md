# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-04-23

### Added

Phase 1 MVP: 16 MCP tools that let an AI agent drive, observe, and move files
in and out of a DOS program running under js-dos.

**Session control**
- `load_bundle(source, autoexec?, mirror?)` — mount a directory / `.zip` / `.jsdos` as drive C: and optionally run autoexec commands.
- `shutdown()` — tear down the emulator.
- `wait(ms)` — let the emulator tick; flushes mirror buffers.

**Input**
- `send_keys(text, key_delay_ms?)` — text-stream keyboard injection.
- `send_key_sequence(keys[])` — named keys with modifier support (`Ctrl+F5`, `ArrowUp`, etc.).
- `send_click(x, y, button?)` — mouse click at canvas-relative coordinates.
- `move_mouse(x, y)` — move without clicking.

**Observation**
- `screenshot(format?)` — PNG or JPEG capture of the current frame.
- `get_status()` — running / dos_time_ms / last_error.

**Virtual DOS filesystem**
- `fs_read(dos_path)` / `fs_write(dos_path, bytes)` / `fs_list(dos_path)` / `fs_delete(dos_path)` — per-file ops.
- `fs_push_dir(host_path, dos_path)` / `fs_pull_dir(dos_path, host_path)` — recursive host↔DOS directory transfer.
- `fs_sync()` — flush any pending mirrored writes to host.

### Architecture
- Node 20+ TypeScript MCP server (stdio transport).
- Puppeteer-spawned Chromium hosts js-dos v8 (`emulators` package); `--attended` flag flips to a visible window.
- `Backend` interface abstraction: unit tests use a `FakeBackend`; production uses the js-dos-driven `JsDosBackend`.

### Tests
- 43 unit tests (paths, backend contract, bundle detection, all tool handlers, mirror).
- 2 integration tests against real Chromium + js-dos (smoke bundle ECHO.COM; fs round-trip).

### Known limitations (deferred to future phases)
- No memory inspection / `read_memory` (Phase 2).
- No save-state snapshot (Phase 2).
- No breakpoints / stepping (Phase 3, tentative).
- Mirror mode is eventually-consistent (flushed at known points), not instant per-write.
- No OCR / screen-text extraction.
- No audio capture.

[0.1.0]: https://github.com/abedegno/dos-mcp/releases/tag/v0.1.0
