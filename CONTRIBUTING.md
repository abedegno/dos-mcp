# Contributing to dos-mcp

Thanks for your interest. This is a small project with a narrow scope — please
read the design goals before opening large PRs.

## Scope

`dos-mcp` is an MCP server that lets AI agents drive DOS programs via js-dos.
It is **not**:
- a general browser-automation framework,
- a game-specific helper library,
- a full CPU-level DOS debugger (Phase 3 is tentative).

Additions that grow scope beyond Phase 2 (memory inspection + save states) are
unlikely to be accepted without a design discussion first.

## Workflow

1. Open an issue describing the change before writing code for anything
   non-trivial. For bug fixes, a clear repro in the issue is enough.
2. Branch from `main`.
3. `npm install` + `npm run test:unit` + `npm run lint` + `npm run typecheck` all
   clean before opening the PR. CI runs all of these plus the integration test.
4. Keep commits small and focused. Conventional-Commits prefixes (`feat:`,
   `fix:`, `test:`, `docs:`, `chore:`, `ci:`) are appreciated but not required.

## Tests

- **Unit tests** (`tests/unit/`) — fast, no emulator. Use `FakeBackend` to test
  the tool layer without spinning up Chromium.
- **Integration tests** (`tests/integration/`) — slow, real Chromium + js-dos.
  Needed when the change touches `src/backend/jsdos.ts` or the boot sequence.
- Any new tool handler needs unit tests against `FakeBackend`.
- The `Backend` interface is the contract — changes to it cascade and need
  tests in both `fake.ts` and `jsdos.ts`.

## Code style

- TypeScript strict mode. Flat ESLint config enforces `@typescript-eslint`'s
  recommended rules with two project-specific exceptions: `no-explicit-any` is
  off (Puppeteer + js-dos interop often needs it), and unused vars are warnings
  not errors (prefix with `_` to silence intentionally).
- Two-space indent, double quotes, trailing commas. Let Prettier happen when it
  needs to.

## License

Contributions are accepted under the project's MIT license. If you include any
non-trivial third-party code, flag the license in the PR body so we can check
compatibility.
