# The interface injection-token pattern

Angular's DI container can hand back **anything** when asked for a class
reference. We exploit that to break the compile-time link between a plugin
and a framework's concrete service. This document walks a junior developer
through why, how, and when to use it.

## The problem it solves

Consider the naive way to share a service:

```ts
// framework/dashboard-state.store.ts
@Injectable({ providedIn: 'root' })
export class DashboardStateStore { /* … */ }

// plugin/dashboard.ts
import { DashboardStateStore } from 'framework';

@Component({ /* … */ })
export class Dashboard {
  protected store = inject(DashboardStateStore);  // ← plugin is now welded
}                                                  //   to the real class
```

The plugin compiles only if the **real** `DashboardStateStore` exists in
its bundle. The test host can no longer substitute a mock without rebuilding
the plugin. The plugin cannot run against a different implementation in a
different host. It is no longer a plugin — it is a fragment of `framework`.

## The fix: three files instead of one

Split the service into a contract and an implementation, and hand out a
token in between.

### 1. The contract — interface + token

```ts
// framework/dashboard-state.store.contract.ts
import { InjectionToken, Signal } from '@angular/core';

export interface DashboardWidget {       // data shape — no "I" prefix
  readonly id: string;
  readonly title: string;
  readonly value: number;
}

export interface IDashboardStateStore {  // service contract — "I" prefix
  readonly widgets: Signal<readonly DashboardWidget[]>;
  loadWidgets(): void;
  selectWidget(id: string): void;
}

export const DASHBOARD_STATE_STORE =
  new InjectionToken<IDashboardStateStore>('DASHBOARD_STATE_STORE');
```

This file has no behavior — it is pure shape. A plugin can depend on this
file without pulling any runtime code.

### 2. The implementation — a normal Angular service

```ts
// framework/dashboard-state.store.ts
@Injectable({ providedIn: 'root' })
export class DashboardStateStore implements IDashboardStateStore {
  /* real Signals, real fetch logic, etc. */
}
```

It declares `implements IDashboardStateStore` so the compiler enforces the
contract.

### 3. The plugin asks for the TOKEN, not the class

```ts
// plugin/dashboard.ts
import { DASHBOARD_STATE_STORE } from 'framework';

@Component({ /* … */ })
export class Dashboard {
  protected store = inject(DASHBOARD_STATE_STORE);  // type IDashboardStateStore
}
```

Now the plugin knows the **shape** but not the **identity** of its
collaborator. It will work with anyone who satisfies `IDashboardStateStore`.

### 4. The host wires the token at composition time

```ts
// app/app.config.ts — production
providers: [
  { provide: DASHBOARD_STATE_STORE, useExisting: DashboardStateStore },
]

// plugin-host/app.config.ts — tests
providers: [
  DashboardStateStoreMock,
  { provide: DASHBOARD_STATE_STORE, useExisting: DashboardStateStoreMock },
]
```

## Singleton semantics

This pattern only works because every consumer ends up sharing the **same
instance**. Two key Angular DI rules guarantee that:

### `providedIn: 'root'` makes the class a per-application singleton

```ts
@Injectable({ providedIn: 'root' })
export class DashboardStateStore { /* … */ }
```

`providedIn: 'root'` tells Angular: "register this class with the **root
injector** of the application." The root injector is created once during
`bootstrapApplication` and lives until the page unloads. The first time
something calls `inject(DashboardStateStore)`, Angular constructs the
class and caches the instance on the root injector. Every subsequent
injection — anywhere in the component tree, anywhere in any other service,
in any lazy-loaded route — returns that same cached instance.

So this is true for both the real store and the mock:

```ts
// Each of these — wherever they appear — yields the SAME object reference:
inject(DashboardStateStore)
inject(DashboardStateStore)   // again, somewhere else
inject(DashboardStateStore)   // again, in a different component
```

There is no "two copies because two components asked for it." The root
injector is a `Map<Token, Instance>` and the singleton is the cached value.

### `useExisting` aliases the token to that singleton — it does NOT clone

The plugin asks for the token, not the class:

```ts
inject(DASHBOARD_STATE_STORE)  // type IDashboardStateStore
```

For that injection to resolve, the host has to teach the injector what
`DASHBOARD_STATE_STORE` resolves to. We do that with `useExisting`:

```ts
{ provide: DASHBOARD_STATE_STORE, useExisting: DashboardStateStore }
```

`useExisting` does **not** create a second instance. It is an **alias**:
"when someone asks for `DASHBOARD_STATE_STORE`, return whatever instance
the injector already has registered for `DashboardStateStore`." Combined
with `providedIn: 'root'`, the result is a single object reachable through
two keys:

```
                        ┌─ inject(DashboardStateStore)        ┐
   one root-injector ───┤                                     ├──► one instance
   cached instance      └─ inject(DASHBOARD_STATE_STORE)      ┘
                          (resolved via useExisting alias)
```

So the plugin and any framework-internal code are guaranteed to be
talking about the same Signals, holding the same selection, observing
the same loading state. That is the entire reason Angular Signals work
as a shared source of truth in this architecture.

### The mock is a singleton too — by the same mechanism

In the test host:

```ts
@Injectable({ providedIn: 'root' })
export class DashboardStateStoreMock implements IDashboardStateStore { /* … */ }

// app.config.ts
providers: [
  DashboardStateStoreMock,
  { provide: DASHBOARD_STATE_STORE, useExisting: DashboardStateStoreMock },
]
```

`providedIn: 'root'` makes the mock a singleton; `useExisting` aliases
the token to it. The Playwright test, the plugin component, and the
mock's bridge-controller registration all see the same mock instance.

> Note: when a class uses `providedIn: 'root'`, listing it again in the
> `providers` array (as `plugin-host` does for the mock) is technically
> redundant for resolution but is harmless and a useful documentation
> signal — it tells the reader "this class is part of the composition
> root for this host."

### Provider forms and what each does to identity

| Provider form         | Identity behavior                                          | When to use                                       |
| --------------------- | ---------------------------------------------------------- | ------------------------------------------------- |
| `useExisting: Cls`    | **Alias** — same singleton instance as the class itself    | Token-to-class binding when class is DI-registered |
| `useClass: Cls`       | **New instance** every time the token is provided          | When you specifically want the token to own its own copy |
| `useValue: { … }`     | Pre-built object handed back as-is                         | Quick stub, plain-data config                     |
| `useFactory: () => …` | Returns whatever the factory returns; can pull other DI   | Construction needs other DI'd inputs              |

The most common subtle bug in this pattern is reaching for `useClass`
when you mean `useExisting`. With

```ts
{ provide: DASHBOARD_STATE_STORE, useClass: DashboardStateStore }
```

you have just told DI to instantiate a **second** `DashboardStateStore`
behind the token. The plugin's `inject(DASHBOARD_STATE_STORE)` returns
that second instance; `inject(DashboardStateStore)` directly returns the
first. They have separate Signals, separate state, and the UI silently
diverges. Use `useExisting` whenever the goal is "the token is just
another name for this already-registered service."

## Naming convention used in this repo

- **Service interface**: `I` prefix (`IDashboardStateStore`,
  `IPlaywrightBridge`). The `I` signals "you can swap this".
- **Service implementation**: takes the unprefixed name
  (`class DashboardStateStore implements IDashboardStateStore`). No `Impl`
  suffix.
- **Data DTO / model**: no prefix (`DashboardWidget`, `BridgeCall`). It's
  just a shape, there's nothing to swap.
- **Injection token**: `SCREAMING_SNAKE_CASE` matching the interface name,
  e.g. `DASHBOARD_STATE_STORE` for `IDashboardStateStore`.
- **File suffix**: contracts go in `*.store.contract.ts` (or
  `*.service.contract.ts`), implementations in `*.store.ts`.

## Common mistakes

- **Importing the implementation from the plugin.** If you
  `import { DashboardStateStore }` inside `projects/plugin/`, you have
  re-coupled.
- **Re-exporting the implementation from the contract file.** Keep
  `dashboard-state.store.contract.ts` import-cycle-free and runtime-free.
- **Using `useClass` where you want `useExisting`.** See the table
  above — this silently produces two store instances.
- **Tokens without a generic.** `new InjectionToken('FOO')` gives you
  `unknown` — write `new InjectionToken<IFoo>('FOO')` so consumers get
  types.
- **Optional injection where the contract is required.** Use
  `inject(TOKEN)` not `inject(TOKEN, { optional: true })` unless the plugin
  truly works without the service. Optional injection silently hides
  composition mistakes.

## Checklist when introducing a new framework service

1. Decide the public methods and read-only state.
2. Write the interface (`I…`).
3. Write the data shapes it returns (no prefix).
4. Define the `InjectionToken` typed as the interface.
5. Write the implementation in a sibling file. Mark
   `@Injectable({ providedIn: 'root' })` so it is a per-app singleton.
6. Export both contract symbols and the implementation from the framework
   library's `public-api.ts`.
7. Wire `{ provide: TOKEN, useExisting: Implementation }` in **every** host
   that needs it (`app`, `plugin-host`, any other host).
8. In plugin-host, write a mock that implements the same interface, mark
   it `providedIn: 'root'` too, and route every method through the
   bridge. See [bridge-pattern.md](bridge-pattern.md).
