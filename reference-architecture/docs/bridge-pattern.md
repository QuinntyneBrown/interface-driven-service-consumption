# The window bridge pattern

Playwright runs in a separate process from the app it tests. It can click,
type, and scrape DOM — but it has no direct handle on the Angular DI tree
or your service objects. The **window bridge** is a tiny shim mounted on
`window` that lets test code do two things:

1. **Observe** which interface methods the plugin called on the (mocked)
   framework, and with what arguments — the *plugin → framework* boundary.
2. **Drive** the mocked framework's state from outside the app, so that
   the plugin's signal-driven UI re-renders the way it would in production
   when real data arrives — the *framework → plugin* boundary.

This document explains the bridge in this repo, both directions, and the
mechanics of `page.evaluate` that ties it to Playwright.

## The setup at a glance

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
- **a `controllers` map** the mock writes itself into (under `'dashboard'`)
  so tests can fetch and call its setters.

**The real framework class never participates in this loop** — that is
the whole point.

## The bridge object

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
- The `declare global` block widens `Window` so TypeScript stops complaining
  in both the app and the e2e tests when they touch
  `window.__pluginHostBridge`.
- The bridge stays **domain-agnostic**. It doesn't know about
  `IDashboardStateStore` — controllers are `<T extends object>` looked up
  by string. Specific controller contracts live next to the mocks that
  implement them.

## Wiring the bridge before bootstrap

The mock store may be eagerly constructed when Angular bootstraps, so the
bridge has to be on `window` **before** `bootstrapApplication` runs:

```ts
// projects/plugin-host/src/main.ts
import { installPlaywrightBridge } from './app/bridge/playwright-bridge';

installPlaywrightBridge();
bootstrapApplication(App, appConfig);
```

If you flip the order you may see "cannot read properties of undefined"
the first time the mock fires. Always install first.

## Direction 1: plugin → framework (call recording)

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

1. **Every command method records before doing local work.** The recording
   is the assertion target; the local update keeps the UI in a believable
   state so the test can also visually verify.
2. **Read-only state lives entirely in the mock.** The bridge does not
   stream Signals out — Playwright observes state through the rendered DOM,
   not through the bridge. The bridge captures *commands*, not state.

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

## Direction 2: framework → plugin (controller registry)

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
[injection-token-pattern.md](injection-token-pattern.md#singleton-semantics)),
the constructor runs once and registers the singleton's `this` as the
`'dashboard'` controller. Any test in any spec sees the same controller
object as the plugin sees the same store.

### Why `NgZone.run` wraps the setters

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

## `page.evaluate` — the Node↔browser hatch

Everything Playwright does on the bridge goes through `page.evaluate`.
It is worth understanding what it actually does because it dictates the
shape of the bridge API.

### What it is

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

### What can cross the boundary

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

### Two functions, two contexts

A common surprise: this code does NOT work the way it looks.

```ts
const widgets = [{ id: 'a', title: 'Alpha', value: 10 }];

await page.evaluate(() => {
  // ❌ ReferenceError in the BROWSER — `widgets` is a Node-side variable
  window.__pluginHostBridge?.controller('dashboard')?.setWidgets(widgets);
});
```

The arrow function is shipped to the browser as source text. It does not
close over `widgets`; it is a brand-new function in a different JS
context. To pass `widgets` across, hand it as the second arg:

```ts
await page.evaluate((next) => {
  window.__pluginHostBridge?.controller('dashboard')?.setWidgets(next);
}, widgets);  // structured-cloned across the boundary
```

That is exactly the shape the Page Object's helpers use.

## Page Object Model: driver AND verifier

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

### Tests read as specifications of both directions

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

## Resetting between tests

`beforeEach` calls `dashboard.goto()`, which navigates and then calls
`resetBridge()`. That clears `bridge.calls` so call assertions don't
bleed across tests. Mock signal state resets implicitly because each
Playwright test gets a fresh page (and therefore a fresh root injector,
fresh mock instance, fresh signals).

If you ever need to also reset state mid-test (e.g. between phases),
use the controller's setters — that is what they exist for.

## Adding a new framework method to the bridge story

When you add a method to a framework interface (say, `IDashboardStateStore`
gains a `clearSelection()` call):

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

## What the bridge is NOT

- **Not a public API.** It exists only in `plugin-host`. The production
  `app` never installs or imports it.
- **Not a substitute for unit tests of the framework.** The framework's
  real implementation should have its own tests. The bridge proves the
  plugin *calls* the framework correctly and that the plugin *re-renders*
  when the framework's signals change; framework tests prove the
  framework *behaves* correctly.
- **Not a state store.** Don't put domain state on the bridge. The mock's
  Signals own state; the bridge owns the observation log and the
  controller registry.
- **Not coupled to any specific contract.** The bridge core
  (`registerController` / `controller<T>(name)`) is generic. Per-feature
  controllers live next to their mocks.
