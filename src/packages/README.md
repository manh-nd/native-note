# Packages (Deep Modules)

Each folder under `src/packages/` is a **deep module**: a lot of behavior hidden behind a small interface.

## Package Layout

```
src/packages/
  <name>/
    index.ts        ← Entry point (public interface). Import this from outside.
    client.ts       ← Another entry point. A package may expose multiple entry points.
    lib/            ← Private implementation details. Hidden from outside.
    tests/          ← Private tests and co-located test fixtures.
```

## Boundary Rules

1. **Entry-point boundary**: Code outside a package may import only that package's entry points (root files), never anything in its subfolders.
2. **Intra-package freedom**: A package's own files are free to import each other without boundary restrictions.
3. **Tests through entry points**: Tests under `<pkg>/tests/` must exercise the package through its entry points. They cannot import private internals (not even their own `lib/` files).
4. **No circular dependencies**: Cycle checking is enforced across all packages.

## Barrels are Discouraged

Do not use barrel files that simply re-export a whole subtree. Instead, expose several small, specific entry points (e.g. `index.ts`, `client.ts`) directly at the package root.

## Running Checks

To verify boundary compliance:

```bash
pnpm run lint:boundaries
```
