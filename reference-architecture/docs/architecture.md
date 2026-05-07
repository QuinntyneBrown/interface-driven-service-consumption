# Reference architecture: interface-driven service consumption in Angular

This workspace is a small but complete demonstration of **interface-driven
service consumption** in Angular. Plugin code talks to framework services
only through interfaces handed out as `InjectionToken`s. Whoever
bootstraps the application chooses which implementation backs each token.

That single discipline is what makes the whole thing testable end-to-end
without ever running the real framework.

## Table of contents

1. [Architecture overview](#1-architecture-overview)
   - [The four projects](#the-four-projects)
   - [Dependency rules (read these first)](#dependency-rules-read-these-first)
   - [Why this shape?](#why-this-shape)
   - [The store is a singleton — and the token is a singleton handle to it](#the-store-is-a-singleton--and-the-token-is-a-singleton-handle-to-it)
   - [Reactive data flow at runtime](#reactive-data-flow-at-runtime)
   - [Reading order for new contributors](#reading-order-for-new-contributors)
2. [The interface injection-token pattern](#2-the-interface-injection-token-pattern)
   - [The problem it solves](#the-problem-it-solves)
   - [The fix: three files instead of one](#the-fix-three-files-instead-of-one)
   - [Singleton semantics](#singleton-semantics)
   - [Naming convention used in this repo](#naming-convention-used-in-this-repo)
   - [Common mistakes](#common-mistakes)
   - [Checklist when introducing a new framework service](#checklist-when-introducing-a-new-framework-service)
3. [The window bridge pattern](#3-the-window-bridge-pattern)
   - [The setup at a glance](#the-setup-at-a-glance)
   - [The bridge object](#the-bridge-object)
   - [Wiring the bridge before bootstrap](#wiring-the-bridge-before-bootstrap)
   - [Direction 1: plugin → framework (call recording)](#direction-1-plugin--framework-call-recording)
   - [Direction 2: framework → plugin (controller registry)](#direction-2-framework--plugin-controller-registry)
   - [`page.evaluate` — the Node↔browser hatch](#pageevaluate--the-nodebrowser-hatch)
   - [Page Object Model: driver AND verifier](#page-object-model-driver-and-verifier)
   - [Resetting between tests](#resetting-between-tests)
   - [Adding a new framework method to the bridge story](#adding-a-new-framework-method-to-the-bridge-story)
   - [What the bridge is NOT](#what-the-bridge-is-not)

> **Diagrams.** Class, sequence, component, and architecture diagrams
> live in [`diagrams/`](diagrams/) — see
> [`diagrams/README.md`](diagrams/README.md) for the index. Specific
> diagrams are linked inline from the section they illustrate.

---

## 1. Architecture overview

### The four projects

> See [`diagrams/component-diagram.puml`](diagrams/component-diagram.puml)
> for the full component view including the explicitly-forbidden
> `plugin → real implementation` edge.

```
projects/
├── framework/      Angular library
│                   ├─ Service contracts: interface + InjectionToken (the WHAT)
│                   └─ Real service implementations (the HOW, for production)
│
├── plugin/         Angular library
│                   └─ UI components that inject framework TOKENS only.
│                      No reference to any concrete framework class.
│
├── app/            Angular application — production wiring
│                   └─ Provides REAL framework implementations behind the tokens
│                      Wraps the plugin in an Angular Material shell
│
└── plugin-host/    Angular application — Playwright test wiring
                    ├─ Provides MOCK implementations behind the tokens
                    ├─ Installs a window bridge that records mock calls AND
                    │   exposes typed controllers tests use to drive state
                    └─ e2e/ — Playwright POM tests assert on the bridge
```

### Dependency rules (read these first)

| From          | May depend on                                                       |
| ------------- | ------------------------------------------------------------------- |
| `framework`   | nothing in this workspace                                           |
| `plugin`      | `framework` — but only `*.contract.ts` files (interfaces + tokens)  |
| `app`         | `framework`, `plugin`, `@angular/material`                          |
| `plugin-host` | `framework` (contracts), `plugin`, `@playwright/test`               |

The crucial rule is **"plugin imports tokens, never classes"**. If you ever
find yourself adding `import { DashboardStateStore } from 'framework'`
inside `projects/plugin/`, stop — you are about to fuse the plugin to a
specific implementation and the plugin-host can no longer mock it.

### Why this shape?

- **Plugins are deployed independently of the host.** They cannot know
  which implementation is wired up. Tokens give them a stable handle.
- **Tests should pin the contract, not the implementation.** Playwright
  asserts on what the plugin asked the framework to do — not on the
  framework's own behavior, which has its own tests elsewhere.
- **The mock and the real impl share an interface.** If the contract
  evolves, the TypeScript compiler forces both sides to keep up.

### The store is a singleton — and the token is a singleton handle to it

The whole interface-driven pattern only works because there is exactly
**one** `DashboardStateStore` instance per application — both real and
mocked. If two consumers got two different instances, they would observe
two different sets of Signals, and the plugin's "reactive UI" would fall
apart.

Two pieces of Angular DI conspire to keep it a singleton:

1. **`@Injectable({ providedIn: 'root' })`** on the implementation
   registers it with the **root injector**. Angular constructs the class
   lazily on first injection, then caches that instance for the rest of
   the application's lifetime. Every subsequent `inject(DashboardStateStore)`
   anywhere in the app returns the same object reference.

2. **`{ provide: DASHBOARD_STATE_STORE, useExisting: DashboardStateStore }`**
   in `app.config.ts` does **not** create a second instance — `useExisting`
   is a pure alias. It tells Angular "when someone asks for the token,
   hand them whatever instance is already registered for the class."

The combined effect:

```
                        ┌─ inject(DashboardStateStore)        ┐
   one root-injector ───┤                                     ├──► one instance
   cached instance      └─ inject(DASHBOARD_STATE_STORE)      ┘
                          (resolved via useExisting alias)
```

The plugin only ever asks for the token, but it shares the one-and-only
store with anything in the app that asks for the class directly. The
mock follows the same shape: `DashboardStateStoreMock` is also
`providedIn: 'root'`, and the plugin-host aliases the token to it. One
mock, one set of Signals, one observable source of truth for tests.

A subtle counter-pattern to know about: `useClass: DashboardStateStore`
would tell DI to instantiate a **second** copy behind the token — same
class, different instance, two parallel Signal graphs. That is almost
never what you want here. See
[Singleton semantics](#singleton-semantics) below for the full table of
provider forms and what each one does to identity.

> Visuals (read in order):
> 0. [`diagrams/singleton-0-registration-paths.drawio`](diagrams/singleton-0-registration-paths.drawio)
>    — two ways to register (on the class vs. in `app.config.ts`),
>    both land on the root injector.
> 1. [`diagrams/singleton-1-one-instance.drawio`](diagrams/singleton-1-one-instance.drawio)
>    — once registered, the root injector caches one instance.
> 2. [`diagrams/singleton-2-token-alias.drawio`](diagrams/singleton-2-token-alias.drawio)
>    — `useExisting` adds the token as a second key to the same instance.
> 3. [`diagrams/singleton-3-useclass-anti-pattern.drawio`](diagrams/singleton-3-useclass-anti-pattern.drawio)
>    — what `useClass` looks like and why you don't want it.

### Reactive data flow at runtime

Both hosts wire the token to a singleton store; the plugin reads Signals
from it and renders. The diagram below shows production (`app/`) on the
left, the test host (`plugin-host/`) on the right, and the same plugin
component in the middle:

```
                ┌──────────── plugin (lib-dashboard) ────────────┐
                │  inject(DASHBOARD_STATE_STORE)                 │
                │       ▲                                        │
                │       │ Signal reads in template               │
                │       │ (widgets, loading, selectedWidgetId,   │
                │       │  computed selectedWidget)              │
                └───────┼────────────────────────────────────────┘
                        │
        ┌───────────────┴───────────────┐
        │                               │
 ┌──────┴──────┐                 ┌──────┴──────┐
 │     app     │                 │ plugin-host │
 │             │                 │             │
 │ token alias │                 │ token alias │
 │  ↓          │                 │  ↓          │
 │ DashboardSt │                 │ DashboardSt │
 │ ateStore    │                 │ ateStoreMock│
 │ (real fetch │                 │ (in-memory  │
 │  + signals) │                 │  signals,   │
 │             │                 │  records    │
 │             │                 │  every call │
 │             │                 │  on bridge) │
 └─────────────┘                 └─────────────┘
```

In `app`, the Signals update from real work — fetches, computations, etc.
In `plugin-host`, the Signals update either from inside the mock (when
the plugin calls a command method like `selectWidget`) or from outside
the app (when a Playwright test pushes new state through the bridge
controller). Either way, the plugin re-renders through the same Signal
mechanism — it has no idea which side of the boundary it is on.

### Reading order for new contributors

1. `projects/framework/src/lib/stores/dashboard-state.store.contract.ts`
   — the interface and token. Start here.
2. `projects/framework/src/lib/stores/dashboard-state.store.ts` — the real
   implementation.
3. `projects/plugin/src/lib/dashboard/dashboard.ts` — the plugin
   component. Note it imports only the token from `framework`.
4. `projects/app/src/app/app.config.ts` — production wiring. Note the
   `useExisting: DashboardStateStore` line.
5. `projects/plugin-host/src/app/app.config.ts` — test wiring.
   `useExisting: DashboardStateStoreMock`.
6. `projects/plugin-host/src/app/mocks/dashboard-state.store.mock.ts` —
   the mock that records calls AND exposes a controller for tests.
7. `projects/plugin-host/src/app/bridge/playwright-bridge.ts` — the
   bridge itself.
8. `projects/plugin-host/e2e/pages/dashboard.page.ts` — Page Object.
9. `projects/plugin-host/e2e/tests/dashboard.spec.ts` — the tests.

---

## 2. The interface injection-token pattern

Angular's DI container can hand back **anything** when asked for a class
reference. We exploit that to break the compile-time link between a
plugin and a framework's concrete service. This section walks a junior
developer through why, how, and when to use it.

> See [`diagrams/class-diagram.puml`](diagrams/class-diagram.puml) for
> the full class view: `IDashboardStateStore`, `DashboardStateStore`,
> `DashboardStateStoreMock`, `IDashboardStateController`, the
> `DASHBOARD_STATE_STORE` token, the bridge, and how the composition
> roots wire them.

### The problem it solves

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
its bundle. The test host can no longer substitute a mock without
rebuilding the plugin. The plugin cannot run against a different
implementation in a different host. It is no longer a plugin — it is a
fragment of `framework`.

### The fix: three files instead of one

Split the service into a contract and an implementation, and hand out a
token in between.

#### 1. The contract — interface + token

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

#### 2. The implementation — a normal Angular service

```ts
// framework/dashboard-state.store.ts
@Injectable({ providedIn: 'root' })
export class DashboardStateStore implements IDashboardStateStore {
  /* real Signals, real fetch logic, etc. */
}
```

It declares `implements IDashboardStateStore` so the compiler enforces
the contract.

#### 3. The plugin asks for the TOKEN, not the class

```ts
// plugin/dashboard.ts
import { DASHBOARD_STATE_STORE } from 'framework';

@Component({ /* … */ })
export class Dashboard {
  protected store = inject(DASHBOARD_STATE_STORE);  // type IDashboardStateStore
}
```

Now the plugin knows the **shape** but not the **identity** of its
collaborator. It will work with anyone who satisfies
`IDashboardStateStore`.

#### 4. The host wires the token at composition time

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

### Singleton semantics

This pattern only works because every consumer ends up sharing the **same
instance**. Two key Angular DI rules guarantee that:

#### `providedIn: 'root'` makes the class a per-application singleton

```ts
@Injectable({ providedIn: 'root' })
export class DashboardStateStore { /* … */ }
```

`providedIn: 'root'` tells Angular: "register this class with the **root
injector** of the application." The root injector is created once during
`bootstrapApplication` and lives until the page unloads. The first time
something calls `inject(DashboardStateStore)`, Angular constructs the
class and caches the instance on the root injector. Every subsequent
injection — anywhere in the component tree, anywhere in any other
service, in any lazy-loaded route — returns that same cached instance.

So this is true for both the real store and the mock:

```ts
// Each of these — wherever they appear — yields the SAME object reference:
inject(DashboardStateStore)
inject(DashboardStateStore)   // again, somewhere else
inject(DashboardStateStore)   // again, in a different component
```

There is no "two copies because two components asked for it." The root
injector is a `Map<Token, Instance>` and the singleton is the cached
value.

#### `useExisting` aliases the token to that singleton — it does NOT clone

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
with `providedIn: 'root'`, the result is a single object reachable
through two keys:

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

#### The mock is a singleton too — by the same mechanism

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

#### Provider forms and what each does to identity

| Provider form         | Identity behavior                                          | When to use                                       |
| --------------------- | ---------------------------------------------------------- | ------------------------------------------------- |
| `useExisting: Cls`    | **Alias** — same singleton instance as the class itself    | Token-to-class binding when class is DI-registered |
| `useClass: Cls`       | **New instance** every time the token is provided          | When you specifically want the token to own its own copy |
| `useValue: { … }`     | Pre-built object handed back as-is                         | Quick stub, plain-data config                     |
| `useFactory: () => …` | Returns whatever the factory returns; can pull other DI    | Construction needs other DI'd inputs              |

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

### Naming convention used in this repo

- **Service interface**: `I` prefix (`IDashboardStateStore`,
  `IPlaywrightBridge`). The `I` signals "you can swap this".
- **Service implementation**: takes the unprefixed name
  (`class DashboardStateStore implements IDashboardStateStore`). No
  `Impl` suffix.
- **Data DTO / model**: no prefix (`DashboardWidget`, `BridgeCall`). It's
  just a shape, there's nothing to swap.
- **Injection token**: `SCREAMING_SNAKE_CASE` matching the interface
  name, e.g. `DASHBOARD_STATE_STORE` for `IDashboardStateStore`.
- **File suffix**: contracts go in `*.store.contract.ts` (or
  `*.service.contract.ts`), implementations in `*.store.ts`.

### Common mistakes

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
  `inject(TOKEN)` not `inject(TOKEN, { optional: true })` unless the
  plugin truly works without the service. Optional injection silently
  hides composition mistakes.

### Checklist when introducing a new framework service

1. Decide the public methods and read-only state.
2. Write the interface (`I…`).
3. Write the data shapes it returns (no prefix).
4. Define the `InjectionToken` typed as the interface.
5. Write the implementation in a sibling file. Mark
   `@Injectable({ providedIn: 'root' })` so it is a per-app singleton.
6. Export both contract symbols and the implementation from the
   framework library's `public-api.ts`.
7. Wire `{ provide: TOKEN, useExisting: Implementation }` in **every**
   host that needs it (`app`, `plugin-host`, any other host).
8. In plugin-host, write a mock that implements the same interface, mark
   it `providedIn: 'root'` too, and route every method through the
   bridge. See [Section 3](#3-the-window-bridge-pattern).

---

## 3. The window bridge pattern

> Visuals (read in order):
> 1. [`diagrams/architecture-1-two-processes.drawio`](diagrams/architecture-1-two-processes.drawio)
>    — Node and Browser are two processes; the bridge is the only
>    shared object.
> 2. [`diagrams/architecture-2-call-recording.drawio`](diagrams/architecture-2-call-recording.drawio)
>    — plugin → framework: how a click ends up in `bridge.calls[]` and
>    the test reads it.
> 3. [`diagrams/architecture-3-state-driving.drawio`](diagrams/architecture-3-state-driving.drawio)
>    — framework → plugin: how a test pushes data through the bridge
>    controller and the OnPush UI re-renders (with `NgZone.run`).
>
> For more formal views see
> [`diagrams/sequence-plugin-to-framework.puml`](diagrams/sequence-plugin-to-framework.puml)
> and
> [`diagrams/sequence-framework-to-plugin.puml`](diagrams/sequence-framework-to-plugin.puml).

Playwright runs in a separate process from the app it tests. It can
click, type, and scrape DOM — but it has no direct handle on the Angular
DI tree or your service objects. The **window bridge** is a tiny shim
mounted on `window` that lets test code do two things:

1. **Observe** which interface methods the plugin called on the (mocked)
   framework, and with what arguments — the *plugin → framework*
   boundary.
2. **Drive** the mocked framework's state from outside the app, so that
   the plugin's signal-driven UI re-renders the way it would in
   production when real data arrives — the *framework → plugin*
   boundary.

This section explains the bridge in this repo, both directions, and the
mechanics of `page.evaluate` that ties it to Playwright.

### The setup at a glance

```
┌─────────────── plugin-host (browser) ────────────────┐         ┌─ Playwright (Node) ─┐
│                                                      │         │                     │
│   <lib-dashboard />                                  │         │   page.click(…)     │
│        │                                             │         │   page.evaluate(…)  │
│        │ inject(DASHBOARD_STATE_STORE)               │         │                     │
│        ▼                                             │         │                     │
│   DashboardStateStoreMock  (singleton, providedIn:'root')      │                     │
│   ├── recordCall('selectWidget', ['w1'])  ──► bridge.calls     │                     │
│   └── setWidgets/setLoading/setSelectedWidgetId                │                     │
│        ▲                                             │         │                     │
│        │ controller registered as 'dashboard'                  │                     │
│        ▼                                             │         │                     │
│   window.__pluginHostBridge ────────────────────────►│ ───────►│   read calls /      │
│   ├── recordCall / callsFor / reset                  │  via    │   invoke controller │
│   └── registerController / controller<T>(name)       │ evaluate│                     │
│                                                      │         │                     │
└──────────────────────────────────────────────────────┘         └─────────────────────┘
```

The bridge holds two pieces of state:

- **a `calls[]` log** the mock pushes into;
- **a `controllers` map** the mock writes itself into (under
  `'dashboard'`) so tests can fetch and call its setters.

**The real framework class never participates in this loop** — that is
the whole point.

### The bridge object

```ts
// projects/plugin-host/src/app/bridge/playwright-bridge.ts
export interface BridgeCall {
  readonly method: string;
  readonly args: readonly unknown[];
  readonly ts: number;
}

export interface IPlaywrightBridge {
  // plugin → framework: call recording
  readonly calls: BridgeCall[];
  recordCall(method: string, args: readonly unknown[]): void;
  callsFor(method: string): BridgeCall[];
  reset(): void;

  // framework → plugin: controller registry
  registerController<T extends object>(name: string, controller: T): void;
  controller<T extends object>(name: string): T | undefined;
}

declare global {
  interface Window { __pluginHostBridge?: IPlaywrightBridge; }
}

export function installPlaywrightBridge(): IPlaywrightBridge { /* … */ }
```

Notes:

- **`BridgeCall` is a data DTO** — no `I` prefix.
- **`IPlaywrightBridge` is a behavioral contract** — methods, so `I`.
- The `declare global` block widens `Window` so TypeScript stops
  complaining in both the app and the e2e tests when they touch
  `window.__pluginHostBridge`.
- The bridge stays **domain-agnostic**. It doesn't know about
  `IDashboardStateStore` — controllers are `<T extends object>` looked
  up by string. Specific controller contracts live next to the mocks
  that implement them.

### Wiring the bridge before bootstrap

The mock store may be eagerly constructed when Angular bootstraps, so
the bridge has to be on `window` **before** `bootstrapApplication` runs:

```ts
// projects/plugin-host/src/main.ts
import { installPlaywrightBridge } from './app/bridge/playwright-bridge';

installPlaywrightBridge();
bootstrapApplication(App, appConfig);
```

If you flip the order you may see "cannot read properties of undefined"
the first time the mock fires. Always install first.

### Direction 1: plugin → framework (call recording)

The mock routes every command method through `recordCall`:

```ts
// projects/plugin-host/src/app/mocks/dashboard-state.store.mock.ts
@Injectable({ providedIn: 'root' })
export class DashboardStateStoreMock implements IDashboardStateStore {
  selectWidget(id: string): void {
    window.__pluginHostBridge?.recordCall('selectWidget', [id]);
    this._selectedWidgetId.set(id);
  }
}
```

Two things to notice:

1. **Every command method records before doing local work.** The
   recording is the assertion target; the local update keeps the UI in
   a believable state so the test can also visually verify.
2. **Read-only state lives entirely in the mock.** The bridge does not
   stream Signals out — Playwright observes state through the rendered
   DOM, not through the bridge. The bridge captures *commands*, not
   state.

A test then asserts that the plugin invoked the contract correctly:

```ts
test('clicking Select on w1 records selectWidget("w1")', async () => {
  await dashboard.selectButton('w1').click();
  const calls = await dashboard.getCallsFor('selectWidget');
  expect(calls).toHaveLength(1);
  expect(calls[0]?.args).toEqual(['w1']);
});
```

This test does not assert that any Signal updated, that any HTTP call
fired, or that the rendered DOM contains a particular value. It asserts
**only on the framework boundary** — the plugin's job is to call
`selectWidget('w1')` when the user clicks Select on `w1`. The
framework's job to actually do something with that call is tested
separately in framework's own tests.

### Direction 2: framework → plugin (controller registry)

Tests also need to drive the *other* direction: simulate the framework
pushing fresh data, going into a loading state, or selecting a widget,
and verify the plugin's UI reacts. The mock exposes a typed controller
for that:

```ts
// next to the mock class
export interface IDashboardStateController {
  setWidgets(widgets: readonly DashboardWidget[]): void;
  setLoading(loading: boolean): void;
  setSelectedWidgetId(id: string | null): void;
}

@Injectable({ providedIn: 'root' })
export class DashboardStateStoreMock
  implements IDashboardStateStore, IDashboardStateController
{
  private readonly zone = inject(NgZone);

  constructor() {
    window.__pluginHostBridge?.registerController<IDashboardStateController>(
      'dashboard',
      this,
    );
  }

  setWidgets(widgets: readonly DashboardWidget[]): void {
    this.zone.run(() => this._widgets.set(widgets));
  }
  // … setLoading, setSelectedWidgetId — same shape
}
```

The mock class implements **two** interfaces:

- `IDashboardStateStore` — what the plugin sees, identical to production.
- `IDashboardStateController` — what tests see, **never visible to the
  plugin**. It is the test-only escape hatch into the mock's Signals.

Because the mock is `providedIn: 'root'` (see
[Singleton semantics](#singleton-semantics)), the constructor runs once
and registers the singleton's `this` as the `'dashboard'` controller.
Any test in any spec sees the same controller object as the plugin sees
the same store.

#### Why `NgZone.run` wraps the setters

The controller is invoked from a Playwright `page.evaluate` callback —
which executes in the browser, but **outside Angular's NgZone**. In
Angular 17 with Zone.js, OnPush change detection is scheduled by NgZone
events. A signal `set()` call outside the zone updates the model fine,
but the OnPush plugin view never gets ticked, so the UI does not
re-render and the test sees stale DOM.

Wrapping the setters in `this.zone.run(() => …)` re-enters NgZone before
mutating the signal, so Angular schedules the tick and the view
re-renders. Without that wrap, the framework → plugin tests fail with
"expected widget to update, still showing old value."

### `page.evaluate` — the Node↔browser hatch

Everything Playwright does on the bridge goes through `page.evaluate`.
It is worth understanding what it actually does because it dictates the
shape of the bridge API.

#### What it is

```ts
const calls = await this.page.evaluate(
  (m) => window.__pluginHostBridge?.callsFor(m) ?? [],
  method,
);
```

`page.evaluate(fn, arg)` does the following:

1. **Serializes `arg`** in the Node test process using the
   [structured clone algorithm][sca].
2. **Sends the serialized arg** plus the source text of `fn` over CDP
   (Chrome DevTools Protocol) to the browser.
3. **Executes `fn(arg)` inside the page's JavaScript context.** Inside,
   `window`, `document`, `globalThis`, and any properties hung off them
   (like `window.__pluginHostBridge`) are real and reachable. The Node
   side's variables are not — `fn` is a fresh function in the browser,
   not a closure over your test.
4. **Awaits the result** if `fn` returns a Promise, then **structured-
   clones the return value back** to Node and resolves
   `page.evaluate(...)` with it.

[sca]: https://developer.mozilla.org/docs/Web/API/Web_Workers_API/Structured_clone_algorithm

#### What can cross the boundary

Structured clone supports:

- primitives (strings, numbers, booleans, `null`, `undefined`, BigInt)
- plain objects, arrays, `Map`, `Set`, `Date`, `RegExp`, typed arrays
- nested combinations of the above

It **does NOT** support:

- functions (you cannot pass a callback into `page.evaluate`)
- class instances with private fields, prototypes, or methods (they
  arrive as plain objects on the other side, methods stripped)
- `Symbol`s, DOM nodes (handled via separate `JSHandle` plumbing)
- circular references in some shapes

This is exactly why the bridge API is designed around **plain data**:
`BridgeCall` is `{ method, args, ts }`, controllers accept
`DashboardWidget` records, etc. If `recordCall` returned an instance of
some logger class, the test would receive a stripped plain object on
the Node side and assertions would silently misbehave.

#### Two functions, two contexts

A common surprise: this code does NOT work the way it looks.

```ts
const widgets = [{ id: 'a', title: 'Alpha', value: 10 }];

await page.evaluate(() => {
  // ❌ ReferenceError in the BROWSER — `widgets` is a Node-side variable
  window.__pluginHostBridge?.controller('dashboard')?.setWidgets(widgets);
});
```

The arrow function is shipped to the browser as source text. It does
not close over `widgets`; it is a brand-new function in a different JS
context. To pass `widgets` across, hand it as the second arg:

```ts
await page.evaluate((next) => {
  window.__pluginHostBridge?.controller('dashboard')?.setWidgets(next);
}, widgets);  // structured-cloned across the boundary
```

That is exactly the shape the Page Object's helpers use.

### Page Object Model: driver AND verifier

Tests never touch `window.__pluginHostBridge` directly. The Page Object
encapsulates **both** sides of the bridge — the verification hatch
(reading recorded calls) and the driver hatch (invoking the controller).
That keeps every test boundary aligned with the same API surface.

```ts
// projects/plugin-host/e2e/pages/dashboard.page.ts
type DashboardWidgetInput = { readonly id: string; readonly title: string; readonly value: number };

interface IDashboardStateController {
  setWidgets(widgets: readonly DashboardWidgetInput[]): void;
  setLoading(loading: boolean): void;
  setSelectedWidgetId(id: string | null): void;
}

export class DashboardPage {
  // DOM locators
  readonly root: Locator;
  readonly loadButton: Locator;
  readonly loading: Locator;
  readonly details: Locator;
  // …

  constructor(private readonly page: Page) { /* … */ }

  // ─── plugin → framework: read recorded calls ──────────────────────
  async getCallsFor(method: string): Promise<BridgeCall[]> {
    return this.page.evaluate(
      (m) => window.__pluginHostBridge?.callsFor(m) ?? [],
      method,
    );
  }
  async resetBridge(): Promise<void> {
    await this.page.evaluate(() => window.__pluginHostBridge?.reset());
  }

  // ─── framework → plugin: drive the mock's signals ─────────────────
  async setWidgets(widgets: readonly DashboardWidgetInput[]): Promise<void> {
    await this.page.evaluate((next) => {
      window.__pluginHostBridge
        ?.controller<IDashboardStateController>('dashboard')
        ?.setWidgets(next);
    }, widgets);
  }
  async setLoading(loading: boolean): Promise<void> { /* same shape */ }
  async setSelectedWidgetId(id: string | null): Promise<void> { /* … */ }
}
```

A few intentional choices worth understanding:

- **Local structural types.** `DashboardWidgetInput` and
  `IDashboardStateController` are declared inline in the page object,
  not imported from `framework` or the mock. The e2e folder stays
  self-contained and free of cross-project paths; structural
  compatibility across the `page.evaluate` boundary is all we need.
- **All `page.evaluate` lives in the page object.** Tests never write a
  raw `page.evaluate`. If a new bridge call surfaces, the page object
  grows a method, and tests get a clean named API.
- **One file, both directions.** The same class exposes
  `getCallsFor(...)` (verifier) and `setWidgets(...)` (driver). That is
  the canonical mapping: tests read like specifications because the
  page object is the only thing that "knows how Playwright works."

#### Tests read as specifications of both directions

```ts
// plugin → framework: clicking Select asked the framework to selectWidget('w1')
test('clicking Select on w1 records selectWidget("w1")', async () => {
  await dashboard.selectButton('w1').click();
  const calls = await dashboard.getCallsFor('selectWidget');
  expect(calls).toHaveLength(1);
  expect(calls[0]?.args).toEqual(['w1']);
});

// framework → plugin: pushing widgets into the store re-renders the UI
test('widget list re-renders when the bridge pushes new widgets', async () => {
  await dashboard.setWidgets([
    { id: 'a', title: 'Alpha', value: 10 },
    { id: 'b', title: 'Beta', value: 20 },
  ]);
  await expect(dashboard.widget('a')).toContainText('Alpha: 10');
  await expect(dashboard.widget('b')).toContainText('Beta: 20');
});

// computed reactivity: selection + new data combine through `computed(...)`
test('details panel updates when widgets change while one is selected', async () => {
  await dashboard.setSelectedWidgetId('w1');
  await dashboard.setWidgets([
    { id: 'w1', title: 'Mock Sales', value: 999 },
    { id: 'w2', title: 'Mock Visits', value: 2 },
  ]);
  await expect(dashboard.details).toContainText('Mock Sales — 999');
});
```

### Resetting between tests

`beforeEach` calls `dashboard.goto()`, which navigates and then calls
`resetBridge()`. That clears `bridge.calls` so call assertions don't
bleed across tests. Mock signal state resets implicitly because each
Playwright test gets a fresh page (and therefore a fresh root injector,
fresh mock instance, fresh signals).

If you ever need to also reset state mid-test (e.g. between phases),
use the controller's setters — that is what they exist for.

### Adding a new framework method to the bridge story

When you add a method to a framework interface (say,
`IDashboardStateStore` gains a `clearSelection()` call):

1. Add the method to the interface in `*.contract.ts`.
2. Implement it in the real `DashboardStateStore` in `framework`.
3. Implement it in `DashboardStateStoreMock` and route it through the
   bridge: `window.__pluginHostBridge?.recordCall('clearSelection', [])`.
4. If the new behavior surfaces a new piece of state tests want to
   drive, extend `IDashboardStateController` and the Page Object's
   driver helpers.
5. Add a Page Object accessor for any new UI affordance.
6. Add a Playwright test that exercises both directions where relevant.

The compiler will refuse to build until the mock implements the new
method, which is exactly the safety net you want.

### What the bridge is NOT

- **Not a public API.** It exists only in `plugin-host`. The production
  `app` never installs or imports it.
- **Not a substitute for unit tests of the framework.** The framework's
  real implementation should have its own tests. The bridge proves the
  plugin *calls* the framework correctly and that the plugin
  *re-renders* when the framework's signals change; framework tests
  prove the framework *behaves* correctly.
- **Not a state store.** Don't put domain state on the bridge. The
  mock's Signals own state; the bridge owns the observation log and the
  controller registry.
- **Not coupled to any specific contract.** The bridge core
  (`registerController` / `controller<T>(name)`) is generic. Per-feature
  controllers live next to their mocks.
