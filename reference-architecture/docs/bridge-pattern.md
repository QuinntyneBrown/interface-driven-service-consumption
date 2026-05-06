# The window bridge pattern

Playwright runs in a separate process from the app it tests. It can click,
type, and scrape DOM — but it has no direct handle on the Angular DI tree
or your service objects. The **window bridge** is a tiny shim mounted on
`window` that lets test code observe and (optionally) control the mock
implementations behind the framework interfaces.

This document explains the bridge in this repo, why each piece exists, and
how to extend it safely.

## The setup at a glance

```
┌─────────── plugin-host (browser) ────────────┐         ┌─ Playwright (Node) ─┐
│                                              │         │                     │
│   <lib-dashboard />                          │         │  page.click(...)    │
│        │                                     │         │  page.evaluate(...) │
│        │ inject(DASHBOARD_STATE_STORE)       │         │                     │
│        ▼                                     │         │                     │
│   DashboardStateStoreMock                    │         │                     │
│        │                                     │         │                     │
│        │ recordCall('selectWidget', ['w1'])  │         │                     │
│        ▼                                     │         │                     │
│   window.__pluginHostBridge ────────────────►│ ───────►│  expect(calls)…     │
│                                              │ via     │                     │
└──────────────────────────────────────────────┘ evaluate└─────────────────────┘
```

The bridge stores a list of calls. The mock writes to it. Playwright reads
from it via `page.evaluate`. **The real framework class never participates
in this loop** — that is the whole point.

## The bridge object

```ts
// projects/plugin-host/src/app/bridge/playwright-bridge.ts
export interface BridgeCall {
  readonly method: string;
  readonly args: readonly unknown[];
  readonly ts: number;
}

export interface IPlaywrightBridge {
  readonly calls: BridgeCall[];
  recordCall(method: string, args: readonly unknown[]): void;
  callsFor(method: string): BridgeCall[];
  reset(): void;
}

declare global {
  interface Window { __pluginHostBridge?: IPlaywrightBridge; }
}

export function installPlaywrightBridge(): IPlaywrightBridge { /* … */ }
```

Notes:

- **`BridgeCall` is a data DTO** — no `I` prefix.
- **`IPlaywrightBridge` is a behavioral contract** — it has methods, so it
  gets the `I`.
- The `declare global` block widens `Window` so TypeScript stops complaining
  in both the app and the e2e tests when they touch
  `window.__pluginHostBridge`.

## Wiring the bridge before bootstrap

The mock store may be eagerly constructed once Angular bootstraps, so the
bridge has to be on the window **before** `bootstrapApplication` runs:

```ts
// projects/plugin-host/src/main.ts
import { installPlaywrightBridge } from './app/bridge/playwright-bridge';

installPlaywrightBridge();
bootstrapApplication(App, appConfig);
```

If you flip the order you may see "cannot read properties of undefined" the
first time the mock fires. Always install first.

## The mock routes through the bridge

```ts
// projects/plugin-host/src/app/mocks/dashboard-state.store.mock.ts
@Injectable({ providedIn: 'root' })
export class DashboardStateStoreMock implements IDashboardStateStore {
  /* state signals omitted for brevity */

  selectWidget(id: string): void {
    window.__pluginHostBridge?.recordCall('selectWidget', [id]);
    this._selectedWidgetId.set(id);
  }
}
```

Two things to notice:

1. **Every command method records before doing local work.** The recording
   is the assertion target; the local update is what makes the UI reflect
   the call so the test can also visually verify.
2. **Read-only state lives entirely in the mock.** The bridge does not
   stream signals out — Playwright observes state through the rendered DOM,
   not through the bridge. The bridge captures _commands_, not state.

## Page Object Model in tests

The Playwright tests never touch `window.__pluginHostBridge` directly. A
Page Object owns that hatch:

```ts
// projects/plugin-host/e2e/pages/dashboard.page.ts
export class DashboardPage {
  constructor(private readonly page: Page) { /* … */ }

  async getCallsFor(method: string): Promise<BridgeCall[]> {
    return this.page.evaluate(
      (m) => window.__pluginHostBridge?.callsFor(m) ?? [],
      method,
    );
  }

  async resetBridge(): Promise<void> {
    await this.page.evaluate(() => window.__pluginHostBridge?.reset());
  }
}
```

Tests then read like specifications:

```ts
test('clicking Select on w1 records selectWidget("w1")', async () => {
  await dashboard.selectButton('w1').click();
  const calls = await dashboard.getCallsFor('selectWidget');
  expect(calls).toHaveLength(1);
  expect(calls[0]?.args).toEqual(['w1']);
});
```

The test asserts **only** on the framework boundary. It does not assert
that `setTimeout` ran, that signals updated, or that some HTTP call fired
— those belong in `framework`'s own tests.

## Resetting between tests

`beforeEach` calls `dashboard.goto()`, which navigates and then calls
`resetBridge()`. Without that reset, calls bleed across tests and you get
mysterious `expected 1, got 3` failures. Make every Page Object's `goto`
finish with a reset.

## Adding a new framework method to the bridge story

When you add a method to a framework interface (say, `IDashboardStateStore`
gains a `clearSelection()` call):

1. Add the method to the interface in `*.contract.ts`.
2. Implement it in the real `DashboardStateStore` in `framework`.
3. Implement it in `DashboardStateStoreMock` and route it through the
   bridge: `window.__pluginHostBridge?.recordCall('clearSelection', [])`.
4. Add a Page Object accessor if the new behavior surfaces in the UI.
5. Add a Playwright test that triggers the UI affordance and asserts on
   `getCallsFor('clearSelection')`.

The compiler will refuse to build until the mock implements the new
method, which is exactly the safety net you want.

## What the bridge is NOT

- **Not a public API.** It exists only in `plugin-host`. The production
  `app` never installs or imports it.
- **Not a substitute for unit tests of the framework.** The framework's
  real implementation should have its own tests. The bridge proves the
  plugin _calls_ the framework correctly; framework tests prove the
  framework _behaves_ correctly.
- **Not a state store.** Don't put domain state on the bridge. The mock's
  Signals own state; the bridge owns the observation log.
