import { chromium } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4202';

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

const requests = [];
page.on('response', (res) => {
  const u = res.url();
  if (u.includes('/api/')) requests.push({ url: u, status: res.status() });
});

await page.goto(BASE_URL, { waitUntil: 'networkidle' });

await page.getByTestId('dashboard').waitFor({ timeout: 10_000 });
await page.getByTestId('load-btn').click();

// Wait for at least one widget row
await page.locator('[data-testid^="widget-"]').first().waitFor({ timeout: 10_000 });

const widgets = await page.locator('[data-testid^="widget-"]').all();
const data = [];
for (const w of widgets) {
  const testId = await w.getAttribute('data-testid');
  const title = (await w.locator('[matlistitemtitle], span').first().textContent())?.trim();
  const line = (await w.textContent())?.trim().replace(/\s+/g, ' ');
  data.push({ testId, title, line });
}

await page.screenshot({ path: 'test-results/dashboard-real.png', fullPage: true });

console.log(JSON.stringify({
  widgetCount: widgets.length,
  widgets: data,
  apiCalls: requests,
  consoleErrors,
}, null, 2));

await browser.close();

if (widgets.length === 0) {
  console.error('FAIL: no widgets rendered');
  process.exit(2);
}
if (requests.find((r) => r.url.includes('/api/dashboardwidgets') && r.status === 200) == null) {
  console.error('FAIL: backend /api/dashboardwidgets not called successfully');
  process.exit(3);
}
console.log('OK');
