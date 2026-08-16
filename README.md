# dos-mcp

[![CI](https://github.com/abedegno/dos-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/abedegno/dos-mcp/actions/workflows/ci.yml)
[![Integration](https://github.com/abedegno/dos-mcp/actions/workflows/integration.yml/badge.svg)](https://github.com/abedegno/dos-mcp/actions/workflows/integration.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A Model Context Protocol server that lets AI agents load, drive, observe, and move files in and out of DOS programs running under [js-dos](https://js-dos.com/).

Built for reverse-engineering and retro-porting work, where the AI needs to interact with a real DOS binary as the source of truth — sending keystrokes, capturing screens, and copying files between host and the virtual DOS filesystem.

## Status

**Phase 1 (v0.1.0):** 19 tools — session control, input, observation, filesystem. Usable today.

**Phase 2 (planned):** memory inspection (`read_memory(seg, off)`) and save-state snapshot/restore. These are the features that unlock byte-level debugging against a running DOS emulator — the motivating use case for the whole project.

**Phase 3 (tentative):** breakpoints and stepping. Only if Phase 2 isn't enough.

See [`CHANGELOG.md`](CHANGELOG.md) for release history.

## Install

Needs Node 22.13 or newer. Not yet on npm, so clone and build:

```bash
git clone https://github.com/abedegno/dos-mcp.git
cd dos-mcp
npm install
npm run build
```

`npm install` downloads a Chrome build for Puppeteer. Behind an HTTP proxy that
download needs `proxy-agent`, which is no longer installed for you:

```bash
npm install proxy-agent
```

Puppeteer 25 made it an optional peer dependency, so `HTTP_PROXY` and `HTTPS_PROXY`
are ignored until it is present and the download fails without saying why.

## Use

Add `dos-mcp` to your MCP client's config (example for Claude Code, `~/.claude/mcp.json`):

```json
{
  "mcpServers": {
    "dos-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/dos-mcp/dist/server.js"]
    }
  }
}
```

For an attended session where you can watch the AI drive:

```json
{
  "mcpServers": {
    "dos-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/dos-mcp/dist/server.js", "--attended"]
    }
  }
}
```

Restart your client. The AI will see the tools below in its tool list.

## Tools

### Session control

| Tool | Description |
|---|---|
| `load_bundle(source, autoexec?, mirror?)` | Mount a directory / `.zip` / `.jsdos` as drive C: and optionally run autoexec commands. Mirror pairs live-sync virtual DOS dirs back to host paths on `wait` / `fs_sync` / `shutdown`. |
| `shutdown()` | Tear down the emulator. |
| `wait(ms)` | Let the emulator tick; also flushes pending mirror writes. |

### Input

| Tool | Description |
|---|---|
| `send_keys(text, key_delay_ms?)` | Type literal text. `\n` is Enter and `\t` is Tab; there is no token syntax. |
| `send_key_sequence(keys)` | Named-key sequence with modifier support (e.g. `["Ctrl+F5", "Escape", "ArrowUp"]`). |
| `send_click(x, y, button?)` | Click at canvas-relative coordinates. Moves there first, so it discards a position set by `move_mouse_relative`. |
| `move_mouse(x, y)` | Move the cursor without clicking. |
| `move_mouse_relative(dx, dy)` | Move by a relative delta. Needed for games that track the cursor from INT 33h deltas rather than reading the absolute position, which includes Ultima Underworld. |
| `click_at_cursor(button?, hold_ms?)` | Press and release where the cursor already is, holding for `hold_ms` (default 120) so a slow-polling guest sees it. |

### Observation

| Tool | Description |
|---|---|
| `screenshot(format?)` | Capture the current frame (PNG default, JPEG optional). |
| `get_status()` | Returns `{ running, dos_time_ms, last_error }`. |

### Virtual DOS filesystem

| Tool | Description |
|---|---|
| `fs_read(dos_path)` | Read a file from the virtual DOS FS. |
| `fs_write(dos_path, bytes_base64)` | Write a file to the virtual DOS FS. |
| `fs_list(dos_path)` | List a directory (returns `{ name, size, is_dir }[]`). |
| `fs_stat(dos_path)` | Stat one entry without listing its parent. |
| `fs_delete(dos_path)` | Delete a file. |
| `fs_push_dir(host_path, dos_path)` | Recursively copy a host dir into the virtual DOS FS. |
| `fs_pull_dir(dos_path, host_path)` | Recursively copy a virtual DOS FS subtree to host. |
| `fs_sync()` | Flush any pending mirrored writes to their host dirs. |

Paths accept `C:/FOO/BAR.DAT`, `C:\FOO\BAR.DAT`, or `/FOO/BAR.DAT` (forward-slash unix-style, drive-prefix optional). They're normalised internally.

## Example: round-trip a DOS save file

```
1.  load_bundle(source="/path/to/UW1", autoexec=["UW.EXE"])
2.  fs_push_dir(host_path="/path/to/port-saves/SAVE1", dos_path="C:/SAVE1")
3.  send_key_sequence(["Escape"]) x3, with ~2500ms waits   # title and intro
4.  screenshot()                                  # confirm the main menu
5.  move_mouse_relative(dx=-4000, dy=-4000)       # clamp into the corner
6.  move_mouse_relative(dx=320, dy=322)           # "Journey Onward", observed position
7.  click_at_cursor(hold_ms=200)
8.  wait(2000); screenshot()                      # the save slot list
9.  ... corner-slam again, then click slot 1, observed near (320, 210)
10. wait(2000); screenshot()                      # verify the restore landed
11. fs_pull_dir(dos_path="C:/SAVE2", host_path="/path/to/dos-saves")
12. shutdown()
```

Then the host process can byte-diff the port-written `SAVE1` against the DOS-written
`SAVE2` to spot format drift.

Three things in that sequence are not obvious, and each one cost real time to find:

- **`send_keys` types literal text.** `send_keys("{Enter}")` types seven characters.
  Named keys go through `send_key_sequence`.
- **Absolute mouse motion cannot position UW's cursor.** UW reads INT 33h function
  0x0B and accumulates relative mickeys into its own tracker, ignoring the absolute
  position function 0x03 reports, so `send_click` and `move_mouse` cannot place it.
  Clamp into a corner with a large negative delta, then move by the target offset.
  The 1:1 correspondence between delta and frame pixel is measured for UW at default
  sensitivity, not guaranteed in general, so check a screenshot rather than trusting
  the arithmetic.
- **A click has to be held across real time.** `click_at_cursor` defaults to 120ms
  because a press and release in the same instant is missed entirely: the guest polls
  the mouse and the emulator never ticks between two near-identical timestamps.

Judging the result from screenshots needs care too. Frames only push when the buffer
changes, so a still frame is not proof of a hung guest. Comparing image hashes does not
work either: on UW's menus roughly 2.5% of pixels were observed changing from background
palette animation alone, so every pair of frames hashes differently while telling you
nothing.

Compare the fraction of changed pixels instead. There is no safe universal threshold,
though: a menu highlight, a cursor move or a small dialog can change fewer pixels than
the animation does, so a cutoff chosen to ignore the animation will also ignore those.
Prefer a reference frame for each outcome you care about and ask which one a capture is
closer to.

## Architecture

```
 MCP client (AI agent)
        │ stdio / MCP protocol
        ▼
 ┌──────────────────────────┐
 │ dos-mcp Node process     │
 │  • MCP tool registry     │
 │  • Puppeteer controller  │
 │  • Mirror-sync tracker   │
 └────────────┬─────────────┘
              │ Chrome DevTools Protocol
              ▼
 ┌──────────────────────────┐
 │ Chromium (headless or    │
 │ --attended)              │
 │  • js-dos v8 + bundle    │
 │  • emulated 16 MB DOS    │
 │    memory (WASM heap)    │
 └──────────────────────────┘
```

A `Backend` interface abstracts the emulator so unit tests can use an in-memory `FakeBackend` without spinning up Chromium.

## Develop

```bash
npm install
npm run typecheck
npm run lint
npm run test:unit         # fast, no emulator
npm run test:integration  # slow, real Chromium + js-dos
npm run build
```

Full contribution guidelines: [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Licensing

`dos-mcp` itself is MIT-licensed (see [`LICENSE`](LICENSE)). The js-dos runtime that this project depends on at runtime is **GPL-2.0**. You can use `dos-mcp` freely, but if you distribute a derivative work (or a product that bundles js-dos / `emulators.js`), the GPL-2.0 copyleft obligations apply to that distribution. `dos-mcp` loads `emulators.js` from its CDN at runtime; we do not redistribute it.

Further reading:
- [js-dos project](https://github.com/caiiiycuk/js-dos) and the `emulators` package — Alexander Guryanov (caiiiycuk)
- [Model Context Protocol](https://modelcontextprotocol.io/)
