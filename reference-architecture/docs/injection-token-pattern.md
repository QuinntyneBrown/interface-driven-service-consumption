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

`useExisting` reuses an Angular-managed instance under a second key. Other
providers that work just as well:

| Provider form        | When to use                                     |
| -------------------- | ----------------------------------------------- |
| `useExisting: Cls`   | The class is already a DI-managed singleton     |
| `useClass: Cls`      | You want DI to instantiate a fresh instance     |
| `useValue: { … }`    | Quick stub — typically only in tests            |
| `useFactory: () => …`| Construction needs other DI'd inputs            |

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

- **Importing the implementation from the plugin.** If you `import { DashboardStateStore }` inside `projects/plugin/`, you have re-coupled.
- **Re-exporting the implementation from the contract file.** Keep
  `dashboard-state.store.contract.ts` import-cycle-free and runtime-free.
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
5. Write the implementation in a sibling file. Mark `@Injectable`.
6. Export both contract symbols and the implementation from the framework
   library's `public-api.ts`.
7. Wire `{ provide: TOKEN, useExisting: Implementation }` in **every** host
   that needs it (`app`, `plugin-host`, any other host).
8. In plugin-host, write a mock that implements the same interface and
   route every method through the bridge. See
   [bridge-pattern.md](bridge-pattern.md).
