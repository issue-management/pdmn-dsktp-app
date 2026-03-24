---
name: unit-testing
description: Unit testing conventions and mocking strategy for Vitest. Use when adding, modifying, or reviewing unit test files (*.spec.ts).
user-invocable: false
---

# Unit Testing Conventions

## Mocking Strategy

### Mock Variable Typing

Declare mock variables with the **actual class type**, not inline object shapes:

```typescript
// Correct
let projectsHelper: ProjectsHelper;

// Wrong — do not use inline object shapes
let projectsHelper: { setBacklogProjects: ReturnType<typeof vi.fn> };
```

Cast with `as unknown as ClassName` at the **creation site** in `beforeEach`, so `container.bind()` needs no cast:

```typescript
beforeEach(() => {
  // Cast once at creation
  projectsHelper = {
    setBacklogProjects: vi.fn<() => Promise<undefined>>().mockResolvedValue(undefined),
  } as unknown as ProjectsHelper;

  container = new Container();
  // No cast needed at bind
  container.bind(ProjectsHelper).toConstantValue(projectsHelper);
});
```

Use `vi.mocked()` to access `.mock` properties on mocked methods:

```typescript
expect(vi.mocked(projectsHelper.setBacklogProjects)).toHaveBeenCalledTimes(1);
const arg = vi.mocked(projectsHelper.setBacklogProjects).mock.calls[0][0];
```

### vi.fn() Type Parameters

`vi.fn()` must always have type parameters — never bare `vi.fn()`:

```typescript
// Correct
vi.fn<() => Promise<string>>()
vi.fn<() => string[]>().mockReturnValue([])

// Wrong
vi.fn()
```

### vi.mock() Usage

Use `vi.mock(import('/@/path/to/module'))` with `import()` — not `vi.mock('/@/path/to/module')` as a string. Place `vi.mock()` calls at the top of the file, after imports. Never use `vi.hoisted()`.

### Mock Data Anonymization

Tests that depend on `domains`, `users`, or `extra-domains` data must mock the data modules with fake names (e.g., Alice/alice-gh, test-org/repo-alpha). Never mock the raw JSON files directly.

## Test Structure

### Test Function

Use `test()` not `it()` — both at top level and inside `describe` blocks.

### describe() Titles

Use **string** titles, not class references. Titles must begin with lowercase:

```typescript
// Correct
describe('applyProjectsOnIssuesLogic', () => { ... });

// Wrong
describe(ApplyProjectsOnIssuesLogic, () => { ... });
```

### expect.assertions()

Every test must have `expect.assertions(<N>)` as its first expression. Count the exact number of `expect()` calls and use that number. **Never** use `expect.hasAssertions()`.

### Padding Rules

Blank line required before/after `expect` statement groups and `expect.assertions()`.

### Hooks on Top

Place `beforeEach`/`afterEach` at the top of `describe` blocks, before any `test()` calls.

## Assertions

- Use `toStrictEqual()` instead of `toEqual()` for deep equality
- Use `toContain` for array/string inclusion checks
- Use `toHaveBeenCalledExactlyOnceWith` when applicable
- Use `toBeTypeOf` over `typeof` comparisons
- Use `mockResolvedValue` instead of `mockImplementation(() => Promise.resolve(...))`
- Use `mockReturnValue` instead of `mockImplementation(() => value)`
- Use `test.each` for parameterized tests
- No conditional `expect` — avoid `expect` inside `if`/`switch`
- No conditional tests — avoid `if`/`switch` inside tests
- Max 5 assertions per test — split into multiple tests if needed

## File Conventions

- Test files must match `*.spec.ts` and be colocated next to the source file
- Import `reflect-metadata` at the top of every spec file
- Use `/@/` path alias for imports between source files
