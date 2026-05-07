import { Request, expect, test } from '@playwright/test';
import { FrameworkHostPage } from '../pages/framework-host.page';

/**
 * Verifies the REAL `DashboardStateStore.loadWidgets()` path end-to-end
 * inside a browser. The store, the `DashboardWidgetService`, and Angular's
 * `HttpClient` are all the production wires from the `framework` library.
 *
 * The only seam is the network: Playwright's `page.route` intercepts
 * `/api/dashboardwidgets` and serves a synthetic response, so the suite can
 *   1. inspect the actual HTTP request the framework emits, and
 *   2. assert the store's signals settle to the expected post-fetch shape.
 */
test.describe('Framework DashboardStateStore.loadWidgets() — real store, mocked HTTP', () => {
  const widgetsFixture = [
    { id: 'w1', title: 'Real Sales', value: 42 },
    { id: 'w2', title: 'Real Visits', value: 7 },
  ];

  test('emits a GET to /api/dashboardwidgets and populates the widgets signal', async ({
    page,
  }) => {
    const captured: Request[] = [];
    await page.route('**/api/dashboardwidgets', async (route) => {
      captured.push(route.request());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(widgetsFixture),
      });
    });

    const host = new FrameworkHostPage(page);
    await host.goto();

    // Pre-condition: nothing fetched yet, store is in its initial state.
    const before = await host.getState();
    expect(before.widgets).toEqual([]);
    expect(before.loading).toBe(false);
    expect(captured).toHaveLength(0);

    await host.loadWidgets();

    // The store should observe exactly one GET request to the contract URL.
    await expect.poll(() => captured.length).toBe(1);
    const request = captured[0]!;
    expect(request.method()).toBe('GET');
    expect(new URL(request.url()).pathname).toBe('/api/dashboardwidgets');
    expect(request.postData()).toBeNull();

    // After the response settles, the store's signals reflect the fetched
    // data and the loading flag has flipped back off.
    await expect
      .poll(async () => (await host.getState()).widgets.length)
      .toBe(widgetsFixture.length);

    const after = await host.getState();
    expect(after.widgets).toEqual(widgetsFixture);
    expect(after.loading).toBe(false);
  });

  test('flips the loading signal to true while the request is in flight', async ({
    page,
  }) => {
    let release: (() => void) | undefined;
    const inFlight = new Promise<void>((resolve) => {
      release = resolve;
    });

    await page.route('**/api/dashboardwidgets', async (route) => {
      await inFlight;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(widgetsFixture),
      });
    });

    const host = new FrameworkHostPage(page);
    await host.goto();

    await host.loadWidgets();

    // While the route handler is parked on `inFlight`, the store should have
    // already set loading -> true synchronously inside `loadWidgets()`.
    await expect.poll(async () => (await host.getState()).loading).toBe(true);

    release!();

    await expect.poll(async () => (await host.getState()).loading).toBe(false);
    expect((await host.getState()).widgets).toEqual(widgetsFixture);
  });

  test('clears the loading signal on HTTP error and leaves widgets empty', async ({
    page,
  }) => {
    await page.route('**/api/dashboardwidgets', (route) =>
      route.fulfill({ status: 500, contentType: 'text/plain', body: 'boom' }),
    );

    const host = new FrameworkHostPage(page);
    await host.goto();

    await host.loadWidgets();

    await expect.poll(async () => (await host.getState()).loading).toBe(false);
    const state = await host.getState();
    expect(state.widgets).toEqual([]);
  });
});
