# Could `load-widgets.spec.ts` be replaced by a unit test?

Reference test: `projects/framework-host/e2e/tests/load-widgets.spec.ts`.

## TL;DR

**Mostly yes — but not entirely.** A Jest or Vitest suite using Angular's
`HttpClientTestingModule` (`provideHttpClientTesting()` + `HttpTestingController`)
can cover all three assertions at a fraction of the cost. What it cannot give you
is confidence that the *composition root* is correctly wired (i.e. that
`app.config.ts` actually provides `HttpClient` and the
`DASHBOARD_WIDGET_SERVICE` binding) or that the contract works against a real
browser fetch stack. For those guarantees you still want at least one e2e.

The pragmatic answer for this repo: **keep one e2e as a smoke test, and move
the behavioural matrix into unit tests.**

## What the e2e actually exercises

| Layer                                                          | Real or fake?                          |
| -------------------------------------------------------------- | -------------------------------------- |
| `DashboardStateStore.loadWidgets()` (the system under test)    | Real                                   |
| `DashboardWidgetService` (HTTP adapter)                        | Real                                   |
| Angular `HttpClient` + interceptors                            | Real                                   |
| `provideHttpClient()` wiring in `app.config.ts`                | Real                                   |
| Browser fetch / XHR transport                                  | Real                                   |
| Network endpoint at `/api/dashboardwidgets`                    | **Mocked** via `page.route(...)`       |
| DOM / change detection                                         | Real (signals run inside zone)         |

The seam is the wire. Everything from the call to `loadWidgets()` down to the
`fetch` invocation is production code.

## What an equivalent unit test would look like

Angular ships a first-party HTTP testing utility that mocks at the
`HttpBackend` seam — one layer below `HttpClient`, one layer above the wire.
Sketch:

```ts
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  DASHBOARD_WIDGET_SERVICE,
  DashboardStateStore,
  DashboardWidgetService,
} from 'framework';

describe('DashboardStateStore.loadWidgets()', () => {
  let store: DashboardStateStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: DASHBOARD_WIDGET_SERVICE, useExisting: DashboardWidgetService },
      ],
    });
    store = TestBed.inject(DashboardStateStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('emits GET /api/dashboardwidgets and populates the widgets signal', () => {
    expect(store.widgets()).toEqual([]);
    expect(store.loading()).toBe(false);

    store.loadWidgets();
    expect(store.loading()).toBe(true);

    const req = http.expectOne('/api/dashboardwidgets');
    expect(req.request.method).toBe('GET');
    expect(req.request.body).toBeNull();

    req.flush([{ id: 'w1', title: 'Real Sales', value: 42 }]);

    expect(store.widgets()).toEqual([{ id: 'w1', title: 'Real Sales', value: 42 }]);
    expect(store.loading()).toBe(false);
  });

  it('flips loading true while in flight', () => {
    store.loadWidgets();
    expect(store.loading()).toBe(true);
    http.expectOne('/api/dashboardwidgets').flush([]);
    expect(store.loading()).toBe(false);
  });

  it('clears loading on HTTP error and leaves widgets empty', () => {
    store.loadWidgets();
    http.expectOne('/api/dashboardwidgets').flush('boom', { status: 500, statusText: 'Server Error' });
    expect(store.loading()).toBe(false);
    expect(store.widgets()).toEqual([]);
  });
});
```

This passes in milliseconds, requires no dev server, no proxy config, no
browser, and reproduces every assertion the Playwright suite makes about
*store behaviour*.

## What the unit test gives you with **the same** confidence

| e2e assertion                                                | Unit equivalent (same confidence) |
| ------------------------------------------------------------ | --------------------------------- |
| `request.method() === 'GET'`                                 | `req.request.method === 'GET'`    |
| URL pathname `/api/dashboardwidgets`                         | `http.expectOne('/api/...')`       |
| `request.postData() === null`                                | `req.request.body === null`       |
| `widgets` signal populates after success                     | Identical — same store, same signal |
| `loading` flips `true` during flight, `false` after          | Identical                         |
| `loading` clears + widgets empty on 500                      | Identical                         |

These all live above the `HttpHandler` seam, which is exactly where
`HttpClientTestingModule` substitutes. The store, the service, the URL
contract, the signal graph, and the error branch are all real.

## What the unit test gives you with **less** confidence

| Risk                                                                                | Unit test catches it? | Why |
| ----------------------------------------------------------------------------------- | --------------------- | --- |
| `provideHttpClient()` missing from `app.config.ts`                                   | **No**                | TestBed re-provides it — the production composition root is bypassed. |
| `{ provide: DASHBOARD_WIDGET_SERVICE, useExisting: DashboardWidgetService }` missing | **No**                | TestBed re-binds the token. |
| The proxy `/api → http://localhost:5013` is misconfigured                            | **No**                | Unit tests never speak to a real network. |
| Real browser fetch behaviour (CORS preflight, cookies, redirects)                    | **No**                | `HttpHandler` is mocked. |
| Interceptors that require DI tokens only available at app bootstrap                  | **Partial**           | Depends on whether you re-provide them in TestBed. |
| Bootstrap ordering — bridge registration vs. first signal read                       | **No**                | The bridge only exists in the host app context. |
| Change detection / zone interactions in a real document                              | **No**                | TestBed runs in a JSDOM-ish or headless harness. |

The Playwright test is also implicitly testing the host app's
`app.config.ts` wiring — if `provideHttpClient` was removed, the page would
throw at bootstrap and every spec would fail. That signal is lost in unit
tests.

## Cost / signal trade-off

| Property              | Playwright e2e                    | Jest/Vitest unit                |
| --------------------- | --------------------------------- | ------------------------------- |
| Wall-clock per spec   | ~2–5 s (incl. dev server, nav)    | ~10–50 ms                        |
| Boot cost             | Spawn dev-server, browser, bundle | None                            |
| Failure attribution   | Coarse — could be CSS, bundling, DI, store | Sharp — points at the SUT |
| Flake surface         | Network, viewport, animations     | Near zero                       |
| Catches wiring drift  | **Yes**                           | No                              |
| Catches store-logic regressions | Yes                     | **Yes**                         |
| Debuggability         | DevTools attach, but slower loop  | Step through in IDE             |

## Recommendation

1. **Keep one Playwright spec** as the wiring smoke test — for example, the
   "emits a GET and populates the widgets signal" case. It's the cheapest way
   to detect a missing `provideHttpClient` or a broken `app.config.ts`.
2. **Move the behavioural matrix** (loading flips, error path, future cases
   like cancellation, retry, deduplication) into Jest/Vitest using
   `provideHttpClientTesting`. They run in milliseconds and fail with sharp,
   actionable messages.
3. **Don't duplicate**. If a behaviour is covered by a unit test, the e2e
   does not need to assert it again.

Net: unit tests can carry ~80% of the assertions in `load-widgets.spec.ts`
with equal confidence. The remaining ~20% — composition-root wiring and
real-browser transport — is what e2e is for, and one spec is enough to
guard it.
