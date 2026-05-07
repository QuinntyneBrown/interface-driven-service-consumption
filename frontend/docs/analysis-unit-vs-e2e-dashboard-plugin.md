# Could `dashboard.spec.ts` be replaced by a unit test?

Reference test: `projects/plugin-host/e2e/tests/dashboard.spec.ts`.

## TL;DR

**Mostly yes, with one important caveat.** A Jest/Vitest suite using
`TestBed` + `ComponentFixture` can render the `Dashboard` component against a
fake `IDashboardStateStore`, click buttons, flip signals, and assert on the
DOM — covering ~90% of what the Playwright suite asserts.

The 10% it does **not** cover is the bit the production-test harness was
*deliberately* designed to catch: the **NgZone + OnPush + signal-from-outside-zone**
interaction. The mock store wraps every external mutation in `zone.run(...)`
specifically because, without it, signal writes from `page.evaluate` land in
the model but never trigger change detection on the OnPush plugin view. In
TestBed you call `fixture.detectChanges()` manually, so that bug class becomes
*invisible*.

If you migrate, keep at least one e2e to guard the NgZone contract.

## What the e2e actually exercises

| Layer                                                            | Real or fake?              |
| ---------------------------------------------------------------- | -------------------------- |
| `Dashboard` component (the SUT)                                  | Real                       |
| Angular template + control flow + bindings                       | Real                       |
| `@angular/material` `mat-card`, `mat-list`, `mat-progress-bar`   | Real                       |
| Signal graph + `computed` for `selectedWidget`                   | Real                       |
| OnPush change detection + `NgZone`                               | Real                       |
| `IDashboardStateStore` implementation                            | **Mocked** (`DashboardStateStoreMock`) |
| Browser layout / visibility / clicks                             | Real                       |
| `window.__pluginHostBridge` surface                              | Real                       |

The seam is the **store contract**. The plugin runs unmodified; only the
framework side is faked.

## What an equivalent unit test would look like

```ts
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Dashboard } from 'plugin';
import { DASHBOARD_STATE_STORE, IDashboardStateStore } from 'framework';

function makeFakeStore(): IDashboardStateStore & {
  setWidgets: (w: any[]) => void;
  setLoading: (l: boolean) => void;
  setSelectedWidgetId: (id: string | null) => void;
  loadWidgets: jest.Mock;
  selectWidget: jest.Mock;
  refreshWidget: jest.Mock;
} {
  const widgets = signal<readonly any[]>([
    { id: 'w1', title: 'Mock Sales', value: 1 },
    { id: 'w2', title: 'Mock Visits', value: 2 },
  ]);
  const loading = signal(false);
  const selectedWidgetId = signal<string | null>(null);
  return {
    widgets, loading, selectedWidgetId,
    loadWidgets: jest.fn(),
    selectWidget: jest.fn((id: string) => selectedWidgetId.set(id)),
    refreshWidget: jest.fn(),
    setWidgets: (w) => widgets.set(w),
    setLoading: (l) => loading.set(l),
    setSelectedWidgetId: (id) => selectedWidgetId.set(id),
  };
}

describe('Dashboard plugin', () => {
  let fixture: ComponentFixture<Dashboard>;
  let store: ReturnType<typeof makeFakeStore>;

  beforeEach(() => {
    store = makeFakeStore();
    TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [
        provideNoopAnimations(),
        { provide: DASHBOARD_STATE_STORE, useValue: store },
      ],
    });
    fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();
  });

  it('records exactly one loadWidgets() call', () => {
    fixture.nativeElement
      .querySelector<HTMLButtonElement>('[data-testid=load-btn]')!
      .click();
    expect(store.loadWidgets).toHaveBeenCalledTimes(1);
    expect(store.loadWidgets).toHaveBeenCalledWith();
  });

  it('re-renders the widget list when the signal changes', () => {
    store.setWidgets([{ id: 'a', title: 'Alpha', value: 10 }]);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-testid="widget-a"]'),
    ).toHaveTextContent(/Alpha.*Value: 10/s);
    expect(
      fixture.nativeElement.querySelector('[data-testid="widget-w1"]'),
    ).toBeNull();
  });

  // ... loading toggle, details panel, selected highlight, empty state ...
});
```

Every other Playwright case maps onto the same pattern: fire a click or set a
signal, call `fixture.detectChanges()`, assert on `nativeElement`.

## What the unit test gives you with **the same** confidence

| e2e assertion                                            | Unit equivalent                  |
| -------------------------------------------------------- | -------------------------------- |
| Click `Load` → `loadWidgets()` recorded with `[]`        | `expect(loadWidgets).toHaveBeenCalledWith()` |
| Click `Select` on `w1` → `selectWidget('w1')`            | Same                             |
| Click `Refresh` on `w2` → `refreshWidget('w2')`          | Same                             |
| Multiple selects record in order                         | `mock.calls` ordering            |
| Pushing widgets re-renders rows                          | Set signal, `detectChanges`, query DOM |
| Empty state appears when `widgets = []`                  | Same                             |
| `loading` signal toggles `mat-progress-bar`              | Same                             |
| `selectedWidget` `computed` updates the details panel    | Same — the `computed` is real    |
| Selected row gets `selected` class                       | Same — class binding is real     |
| Details updates when widgets change while one selected   | Same — `computed` re-derives     |

These all live above the rendering boundary and below the network: pure
template + signal behaviour. TestBed reproduces them faithfully.

## What the unit test gives you with **less** confidence

| Risk                                                                                  | Unit catches it? | Why |
| ------------------------------------------------------------------------------------- | ---------------- | --- |
| **NgZone wrap missing on outside-zone signal writes** (`zone.run` in the mock)        | **No** (critical) | TestBed's `detectChanges()` is manual; the failure mode only manifests when a signal write happens outside Angular's zone (real browser, `page.evaluate`). A green unit test does not prove the production wrap is needed or correct. |
| `app.config.ts` token binding (`{ provide: DASHBOARD_STATE_STORE, useExisting: DashboardStateStoreMock }`) | **No**           | TestBed re-binds the token. The wiring at the host's composition root is bypassed. |
| Plugin bundling — does the produced library actually expose `Dashboard`?              | **No**           | TestBed imports the source via path mapping. |
| Material overlay / animation glitches that only show under real layout                | **No**           | JSDOM-style rendering doesn't compute real layout; animations are noop'd. |
| `toBeVisible` semantics (size > 0, not `display:none`, not behind another element)    | **Partial**      | You can assert `null` vs. element, but not real visibility. |
| Bridge mechanism (`window.__pluginHostBridge`) actually wired correctly               | **No**           | Tests bypass the bridge entirely and call the fake directly. |
| Real Vite bundling, lazy chunks, CSP, asset paths                                     | **No**           | No build runs. |

The first row is the one that matters. Read the comment at the top of
`DashboardStateStoreMock`:

> Controller-driven state mutations are wrapped in `NgZone.run` because they
> originate from `page.evaluate` callbacks which execute outside Angular's
> zone — without that wrap, signal updates land in the model but the
> change-detector never ticks the OnPush plugin view.

That is exactly the kind of bug TestBed cannot reproduce. Inside TestBed,
you always call `fixture.detectChanges()` yourself, so a missing zone wrap
is silent. Outside the zone in a real browser, it's the whole-feature failure.

## Cost / signal trade-off

| Property                       | Playwright e2e                     | Jest/Vitest unit              |
| ------------------------------ | ---------------------------------- | ----------------------------- |
| Wall-clock per spec            | ~1–3 s (incl. nav)                 | ~10–50 ms                     |
| Boot cost                      | Spawn dev-server, browser, bundle  | None                          |
| Failure attribution            | Coarse                             | Sharp                         |
| Flake surface                  | Animation, viewport, timing        | Near zero                     |
| Catches OnPush + zone bugs     | **Yes**                            | **No**                        |
| Catches plugin → contract calls | Yes                               | **Yes**                       |
| Catches signal → UI re-render  | Yes                                | **Yes**                       |
| Catches host wiring drift      | Yes                                | No                            |

## Recommendation

1. **Keep ~2 Playwright specs** as the integration smoke tests:
   - one click test (e.g. the multi-select ordering case) — proves plugin →
     contract wiring through real DOM events;
   - one external-signal-push test (e.g. "widget list re-renders when the
     bridge pushes new widgets") — this is the *only* place that proves
     the `NgZone.run` wrap is correct.
2. **Move the rest** of the matrix into Jest/Vitest TestBed specs:
   - all click → method-args assertions;
   - all signal → DOM render assertions where the signal write happens
     inside the test process (already in-zone);
   - all `computed`-derived behaviour (details panel, selected highlight).
3. **Don't try to unit-test the zone contract.** That's load-bearing in
   production; the e2e is the right tool because the failure only
   manifests when the signal write originates outside Angular's zone.

Net: TestBed can carry ~90% of `dashboard.spec.ts` with equal confidence,
faster and with sharper failure messages. The remaining ~10% is the
zone-from-outside scenario, which is what Playwright is uniquely good at.
