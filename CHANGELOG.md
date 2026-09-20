# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-09-20

### Added

- `read_memory(address | segment+offset, length)` and `search_memory(pattern_base64, ...)` —
  read-only access to the guest's emulated DOS memory. js-dos exposes no memory API and the
  wasm build exports no `mem_readb`, so these reach DOSBox-X's RAM through the emscripten
  module at `ci.transport.module.HEAPU8`. Guest physical 0 is located by fingerprinting the
  BIOS data area (COM port table at `0x400`, 640 KB size word at `0x413`), re-validated on
  every call because emscripten replaces the heap view when wasm memory grows.
- The chosen js-dos build is reported on startup, so which emulator is in use is never
  a guess. `DOSMCP_JSDOS_DIR` overrides the bundled one and fails loudly if it points
  somewhere without an `emulators.js`, rather than quietly downgrading.
- `dos-pull.mjs`, `dos-push.mjs` and `dos-shot.mjs`, which attach to a running session and
  read or write the emulated filesystem without restarting it. A restart rebuilds that
  filesystem from disk and loses anything the guest wrote, which made a save produced
  inside DOS awkward to get at. `dos-push.mjs` reads each file back after writing, because
  a push into a slot the game has never created reports success and does nothing.
- `move_mouse_relative(dx, dy)` and `click_at_cursor(button?, hold_ms?)` — needed for
  games that track the cursor from INT 33h relative deltas rather than reading the
  absolute position, which includes Ultima Underworld. An absolute move is only ever
  seen as the delta it implies, so it cannot place such a cursor.
- `fs_stat(dos_path)` — stat one entry without listing its parent.
- `host_path` on `screenshot` — write the image to disk and return the path, for frames
  too large to pass through the tool channel.
- The DOS emulator is now an ordinary dependency, pinned to `emulators@8.4.2`, the first
  release containing the INT 33h mickey fix from caiiiycuk/emulators#24. There is nothing
  to build and no environment variable to set.

### Changed

- **Breaking for anyone relying on the CDN fallback:** it is gone, along with the
  auto-detection of a locally built dist in sibling directories. Both could serve a
  different emulator than the pinned one with no error. `DOSMCP_JSDOS_DIR` still overrides.
- **Requires Node 22.13 or newer**, up from 20. Puppeteer 25 requires 22.12, and eslint
  requires 22.13 for the 22 line, so 22.13 is the floor a working tree actually needs.
- `send_keys` no longer silently ignores a character it cannot deliver. It refuses the
  whole call instead, naming the offending characters, so nothing is half-typed.
- `screenshot` is documented as not being an atomic snapshot: the guest keeps running and
  a refused capture is retried, so the frame can be later than the request.

### Fixed

- `send_keys` could not type any shifted character: `>` arrived as `.` and `:` as `;`,
  and uppercase arrived lowercase. Puppeteer gives a shifted character the same keyCode
  as its unshifted twin without setting `shiftKey`, and several of its single-character
  names resolve to keypad keys, so `+` was dropped outright and `?` became `/`.
- `send_keys("\0")` pressed Delete in the guest. Puppeteer aliases NUL to NumpadDecimal,
  keyCode 46, which the bridge maps to `KBD_delete`.
- `send_keys` silently dropped `\b`, `\t`, `\x1b` and `\x7f`, all of which have a real
  key. They are now mapped.
- Mouse input did not reach the guest at all: 8.4.x changed `sendMouseMotion` from canvas
  pixels to normalized 0..1.
- A click delivered as press and release in the same instant was missed entirely, because
  the guest polls the mouse and the emulator never ticks between two near-identical
  timestamps. `click_at_cursor` holds the button for 120ms by default.
- A failed `screenshot` ended the whole session. Capture failures that can recover are
  now retried; those that cannot, such as a closed target or a protocol timeout, still
  fail at once. The underlying intermittent failure is unresolved, see issue #28.
- The server orphaned Chromium processes when a client exited without calling
  `shutdown`, leaving js-dos ticking at full CPU per process.
- Arrow keys were reported as undeliverable in issue #27. They were always delivered;
  the diagnosis was wrong and the issue is closed with regression tests.

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

[0.2.0]: https://github.com/abedegno/dos-mcp/releases/tag/v0.2.0
[0.1.0]: https://github.com/abedegno/dos-mcp/releases/tag/v0.1.0
