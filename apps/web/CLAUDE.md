# CLAUDE.md — apps/web

Vite + React 19 + TanStack Router SPA. Workspace package `@zet-plane/web`. All conventions in the repo-root `CLAUDE.md` (dependency hygiene, naming, etc.) apply here too — this file only adds what is specific to `apps/web`.

## Commands

All commands assume `cd apps/web`.

```bash
# Dev / build
pnpm dev                              # vite dev server
pnpm build                            # tsc -b && vite build
pnpm preview                          # preview the build output

# Tests
pnpm test                             # vitest run (one-shot)
pnpm test:watch                       # vitest watch
pnpm test:e2e                         # playwright

# Lint / format (Biome 2.4.x)
pnpm lint                             # biome check . — read-only check
pnpm lint:fix                         # biome check --write . — safe fixes + format
pnpm lint:fix:unsafe                  # biome check --write --unsafe . — includes unsafe fixes
pnpm format                           # biome format --write . — format only
```

## Lint / format conventions (Biome)

Config lives in [biome.json](biome.json): tab indentation, double quotes, recommended rule set, follows the git ignore file.

- **Run `pnpm lint` before and after edits.** Expect 0 errors before committing.
- **Formatting and linting are the same tool.** No separate prettier/eslint.
- **Fix order**: start with `pnpm lint:fix` (safe fixes + format), then resolve remaining lint errors by hand. Only reach for `pnpm lint:fix:unsafe` when you have confirmed the behavior change is acceptable — it rewrites code (e.g. `entries && entries.map()` → `entries?.map()`, prefixes unused vars with `_`, rewrites `import "path"` → `import "node:path"`).
- **No-install fallback**: `pnpx @biomejs/biome check .` — version may drift from the pinned devDep, so use only when local install is unavailable; the canonical workflow is `pnpm lint`.
- **Do not hand-revert Biome's formatting** (e.g. swapping double quotes back to single, changing indentation). The next `lint` run will undo it.
- **When upgrading Biome**, bump the `$schema` URL at the top of `biome.json` in lockstep with the devDep version, so schema validation and runtime behavior stay aligned.
