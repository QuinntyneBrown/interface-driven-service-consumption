# Architecture overview

This workspace is a small but complete demonstration of **interface-driven
service consumption** in Angular. Plugin code talks to framework services
only through interfaces handed out as `InjectionToken`s. Whoever bootstraps
the application chooses which implementation backs each token.

That single discipline is what makes the whole thing testable end-to-end
without ever running the real framework.

## The four projects

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

## Dependency rules (read these first)

| From          | May depend on                                                   |
| ------------- | --------------------------------------------------------------- |
| `framework`   | nothing in this workspace                                       |
| `plugin`      | `framework` — but only `*.contract.ts` files (interfaces + tokens) |
| `app`         | `framework`, `plugin`, `@angular/material`                      |
| `plugin-host` | `framework` (contracts), `plugin`, `@playwright/test`           |

The crucial rule is **"plugin imports tokens, never classes"**. If you ever
find yourself adding `import { DashboardStateStore } from 'framework'`
inside `projects/plugin/`, stop — you are about to fuse the plugin to a
specific implementation and the plugin-host can no longer mock it.

## Why this shape?

- **Plugins are deployed independently of the host.** They cannot know
  which implementation is wired up. Tokens give them a stable handle.
- **Tests should pin the contract, not the implementation.** Playwright
  asserts on what the plugin asked the framework to do — not on the
  framework's own behavior, which has its own tests elsewhere.
- **The mock and the real impl share an interface.** If the contract
  evolves, the TypeScript compiler forces both sides to keep up.

## The store is a singleton — and the token is a singleton handle to it

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
   is a pure alias. It tells Angular "when someone asks for the token, hand
   them whatever instance is already registered for the class."

The combined effect:

```
inject(DashboardStateStore)         ─┐
                                     ├──► same singleton object
inject(DASHBOARD_STATE_STORE)       ─┘
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
[injection-token-pattern.md](injection-token-pattern.md#singleton-semantics)
for the full table of provider forms and what each one does to identity.

## Reactive data flow at runtime

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

## Reading order for new contributors

1. `projects/framework/src/lib/stores/dashboard-state.store.contract.ts`
   — the interface and token. Start here.
2. `projects/framework/src/lib/stores/dashboard-state.store.ts` — the real
   implementation.
3. `projects/plugin/src/lib/dashboard/dashboard.ts` — the plugin component.
   Note it imports only the token from `framework`.
4. `projects/app/src/app/app.config.ts` — production wiring. Note the
   `useExisting: DashboardStateStore` line.
5. `projects/plugin-host/src/app/app.config.ts` — test wiring.
   `useExisting: DashboardStateStoreMock`.
6. `projects/plugin-host/src/app/mocks/dashboard-state.store.mock.ts` —
   the mock that records calls AND exposes a controller for tests.
7. `projects/plugin-host/src/app/bridge/playwright-bridge.ts` — the bridge
   itself.
8. `projects/plugin-host/e2e/pages/dashboard.page.ts` — Page Object.
9. `projects/plugin-host/e2e/tests/dashboard.spec.ts` — the tests.

For deeper dives see:

- [injection-token-pattern.md](injection-token-pattern.md) — interfaces,
  tokens, singleton semantics, provider forms.
- [bridge-pattern.md](bridge-pattern.md) — the window bridge, the
  controller registry, `page.evaluate` mechanics, POM as driver +
  verifier, NgZone considerations.
