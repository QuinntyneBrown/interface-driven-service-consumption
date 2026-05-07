# Interface-Driven Service Consumption

A reference architecture (Angular) demonstrating how a plugin library can consume
framework services through **interfaces and injection tokens only** — never
through concrete classes — so that the same plugin can run against either a real
implementation in production or a mock implementation under Playwright tests.

The goal is a clean test boundary: Playwright drives the plugin through its UI,
the plugin calls the framework contract, and a `window`-based bridge records
those calls so tests can assert on them — all **without** ever exercising the
real framework implementation.

## Repository layout

```
.
├── docs/
│   └── idea.md                       # original brief
└── reference-architecture/           # Angular workspace
    └── projects/
        ├── framework/                # core lib: contracts + real implementations
        ├── plugin/                   # plugin lib: imports tokens only
        ├── app/                      # production host (real framework wired up)
        └── plugin-host/              # test host (mocks + Playwright bridge)
```

### Dependency graph

```
app          ──► plugin ──► framework
plugin-host  ──► plugin ──► framework
plugin-host  ──► framework (for contracts + mocks)
```

`plugin` depends only on **`framework`** — and within `framework` it imports
only the `*.contract.ts` files (interfaces + `InjectionToken`s). The concrete
`*.store.ts` classes are never referenced by the plugin.

## The pattern in one picture

1. **`framework/.../dashboard-state.store.contract.ts`** declares
   `IDashboardStateStore` and `DASHBOARD_STATE_STORE = new InjectionToken<…>(…)`.
2. **`framework/.../dashboard-state.store.ts`** provides the real
   `DashboardStateStore` implementing `IDashboardStateStore`.
3. **`plugin/.../dashboard.ts`** does only `inject(DASHBOARD_STATE_STORE)` —
   it has no compile-time knowledge of either implementation.
4. **`app`** binds the token to the real `DashboardStateStore`.
5. **`plugin-host`** binds the same token to `DashboardStateStoreMock`, which
   forwards every call to a `window.__pluginHostBridge` that Playwright reads.

## Why an `I` prefix on the interface

`IDashboardStateStore` is a *behavioral contract* with swappable
implementations (`DashboardStateStore`, `DashboardStateStoreMock`). The `I`
prefix flags that this is the seam where polymorphism lives. Plain data shapes
like `DashboardWidget` get no prefix because there is nothing to implement —
just a structure to populate.

The implementation type takes the unprefixed name (`DashboardStateStore`), not
an `Impl` suffix.

## The Playwright bridge

`projects/plugin-host/src/app/bridge/playwright-bridge.ts` installs a tiny
object on `window.__pluginHostBridge` that exposes **both directions** of the
plugin ↔ framework boundary to tests:

- **Plugin → framework (call recording).** The mock pipes every interface
  invocation through `recordCall`, so tests can assert the plugin called the
  contract correctly with `bridge.callsFor('selectWidget')` etc.
- **Framework → plugin (controller registry).** Mocks register a typed
  controller (e.g. `setWidgets`, `setLoading`, `setSelectedWidgetId`) under a
  string name. Tests fetch it via `bridge.controller<T>('dashboard')` and use
  it to push state into the mock's signals — the plugin's signal-driven UI
  then re-renders exactly as it would against the real framework.

The bridge itself stays domain-agnostic; specific controller contracts live
next to the mocks that implement them. Tests in
`projects/plugin-host/e2e/tests/` go through a page object
(`pages/dashboard.page.ts`) for both DOM access and bridge access, so
assertions never touch raw selectors or `page.evaluate` directly.

The bridge ships **only** in `plugin-host`; it never reaches the production
`app` bundle.

## Running it

All commands run from `reference-architecture/`:

```bash
# install
npm install

# build the libs once so the path aliases resolve
npm run build:libs

# run the production app (real framework + Material shell) on :4200
npm run start:app

# run the test host (mock framework + bridge) on :4201
npm run start:plugin-host

# Playwright e2e against the test host (auto-starts plugin-host on :4201)
npm run test:e2e
```

## Documentation

The full deep-dive lives in
[`reference-architecture/docs/architecture.md`](reference-architecture/docs/architecture.md).
It covers, in three sections:

1. **Architecture overview** — the four projects, dependency rules, and
   how the singleton store flows through both hosts.
2. **The interface injection-token pattern** — interface + token +
   implementation split, singleton semantics of `providedIn: 'root'` +
   `useExisting` aliasing, naming conventions, provider-form table, and
   a checklist for adding new services.
3. **The window bridge pattern** — the Playwright bridge in both
   directions (call recording AND controller registry), `page.evaluate`
   mechanics and serialization rules, the Page Object Model as both
   driver and verifier, and the `NgZone.run` wrap that keeps OnPush
   views ticking when tests push state from outside Angular's zone.

## Reading order for new contributors

1. `docs/idea.md` — the original premise.
2. [`reference-architecture/docs/architecture.md`](reference-architecture/docs/architecture.md) —
   how the pieces fit together.
3. `projects/framework/src/lib/stores/dashboard-state.store.contract.ts` — the contract.
4. `projects/plugin/src/lib/dashboard/dashboard.ts` — a consumer that knows only the token.
5. `projects/plugin-host/src/app/mocks/dashboard-state.store.mock.ts` — the swap-in implementation.
6. `projects/plugin-host/src/app/bridge/playwright-bridge.ts` — the test observation point.
7. `projects/plugin-host/e2e/pages/dashboard.page.ts` — the Page Object that owns the bridge.
8. `projects/plugin-host/e2e/tests/dashboard.spec.ts` — what the boundary tests look like.
