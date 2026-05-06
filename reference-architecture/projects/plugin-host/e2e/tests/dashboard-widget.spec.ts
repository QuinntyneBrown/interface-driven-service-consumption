import { expect, test } from '@playwright/test';
import { DashboardPage } from '../pages/dashboard-widget.page';

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
