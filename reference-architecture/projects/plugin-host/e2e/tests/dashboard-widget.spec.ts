import { expect, test } from '@playwright/test';
import { DashboardWidgetPage } from '../pages/dashboard-widget.page';

test.describe('DashboardWidget plugin → framework interface', () => {
  let widget: DashboardWidgetPage;

  test.beforeEach(async ({ page }) => {
    widget = new DashboardWidgetPage(page);
    await widget.goto();
  });

  test('renders the widget shell on load', async () => {
    await expect(widget.root).toBeVisible();
    await expect(widget.widget('w1')).toContainText('Mock Sales');
  });

  test('clicking Load records exactly one loadWidgets() call', async () => {
    await widget.loadButton.click();
    const calls = await widget.getCallsFor('loadWidgets');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args).toEqual([]);
  });

  test('clicking Select on w1 records selectWidget("w1")', async () => {
    await widget.selectButton('w1').click();
    const calls = await widget.getCallsFor('selectWidget');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args).toEqual(['w1']);
  });

  test('clicking Refresh on w2 records refreshWidget("w2")', async () => {
    await widget.refreshButton('w2').click();
    const calls = await widget.getCallsFor('refreshWidget');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args).toEqual(['w2']);
  });

  test('multiple selections record in order', async () => {
    await widget.selectButton('w1').click();
    await widget.selectButton('w2').click();
    const calls = await widget.getCallsFor('selectWidget');
    expect(calls.map((c) => c.args[0])).toEqual(['w1', 'w2']);
  });
});
