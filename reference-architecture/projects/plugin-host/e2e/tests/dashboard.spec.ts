import { expect, test } from '@playwright/test';
import { DashboardPage } from '../pages/dashboard.page';

test.describe('Dashboard plugin → framework interface', () => {
  let dashboard: DashboardPage;

  test.beforeEach(async ({ page }) => {
    dashboard = new DashboardPage(page);
    await dashboard.goto();
  });

  test('renders the dashboard shell on load', async () => {
    await expect(dashboard.root).toBeVisible();
    await expect(dashboard.widget('w1')).toContainText('Mock Sales');
  });

  test('clicking Load records exactly one loadWidgets() call', async () => {
    await dashboard.loadButton.click();
    const calls = await dashboard.getCallsFor('loadWidgets');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args).toEqual([]);
  });

  test('clicking Select on w1 records selectWidget("w1")', async () => {
    await dashboard.selectButton('w1').click();
    const calls = await dashboard.getCallsFor('selectWidget');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args).toEqual(['w1']);
  });

  test('clicking Refresh on w2 records refreshWidget("w2")', async () => {
    await dashboard.refreshButton('w2').click();
    const calls = await dashboard.getCallsFor('refreshWidget');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args).toEqual(['w2']);
  });

  test('multiple selections record in order', async () => {
    await dashboard.selectButton('w1').click();
    await dashboard.selectButton('w2').click();
    const calls = await dashboard.getCallsFor('selectWidget');
    expect(calls.map((c) => c.args[0])).toEqual(['w1', 'w2']);
  });
});

test.describe('Dashboard plugin ← framework signals (via bridge controller)', () => {
  let dashboard: DashboardPage;

  test.beforeEach(async ({ page }) => {
    dashboard = new DashboardPage(page);
    await dashboard.goto();
  });

  test('widget list re-renders when the bridge pushes new widgets', async () => {
    await dashboard.setWidgets([
      { id: 'a', title: 'Alpha', value: 10 },
      { id: 'b', title: 'Beta', value: 20 },
    ]);

    await expect(dashboard.widget('a')).toContainText('Alpha: 10');
    await expect(dashboard.widget('b')).toContainText('Beta: 20');
    // Originally seeded widgets are gone — the signal replaced the list.
    await expect(dashboard.widget('w1')).toHaveCount(0);
  });

  test('loading indicator toggles with the loading signal', async () => {
    await expect(dashboard.loading).toBeHidden();

    await dashboard.setLoading(true);
    await expect(dashboard.loading).toBeVisible();

    await dashboard.setLoading(false);
    await expect(dashboard.loading).toBeHidden();
  });

  test('details panel reactively reflects the selected widget', async () => {
    await expect(dashboard.detailsEmpty).toBeVisible();

    await dashboard.setSelectedWidgetId('w1');
    await expect(dashboard.details).toContainText('Mock Sales — 1');

    await dashboard.setSelectedWidgetId('w2');
    await expect(dashboard.details).toContainText('Mock Visits — 2');

    await dashboard.setSelectedWidgetId(null);
    await expect(dashboard.detailsEmpty).toBeVisible();
  });

  test('details panel updates when widgets change while one is selected', async () => {
    await dashboard.setSelectedWidgetId('w1');
    await expect(dashboard.details).toContainText('Mock Sales — 1');

    // Simulate the framework pushing fresh data (e.g. after a refresh)
    // while the selection is still active. The `computed` re-derives.
    await dashboard.setWidgets([
      { id: 'w1', title: 'Mock Sales', value: 999 },
      { id: 'w2', title: 'Mock Visits', value: 2 },
    ]);
    await expect(dashboard.details).toContainText('Mock Sales — 999');
  });

  test('selected row highlight follows the selectedWidgetId signal', async () => {
    await expect(dashboard.widget('w1')).not.toHaveClass(/selected/);

    await dashboard.setSelectedWidgetId('w1');
    await expect(dashboard.widget('w1')).toHaveClass(/selected/);
    await expect(dashboard.widget('w2')).not.toHaveClass(/selected/);

    await dashboard.setSelectedWidgetId('w2');
    await expect(dashboard.widget('w2')).toHaveClass(/selected/);
    await expect(dashboard.widget('w1')).not.toHaveClass(/selected/);
  });

  test('empty state appears when widgets is set to []', async () => {
    await dashboard.setWidgets([]);
    await expect(dashboard.widget('w1')).toHaveCount(0);
    await expect(dashboard.empty).toBeVisible();
  });
});
