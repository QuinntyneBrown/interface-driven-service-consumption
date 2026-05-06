import { Locator, Page } from '@playwright/test';
import type { BridgeCall } from '../../src/app/bridge/playwright-bridge';

/**
 * Structural types mirroring the test-facing surface of the dashboard mock.
 * Declared locally so the e2e folder stays self-contained and does not depend
 * on Angular's `framework` path alias or the mock's internal module. The mock
 * is the canonical implementer; these shapes only have to be structurally
 * compatible across the `page.evaluate` boundary.
 */
type DashboardWidgetInput = {
  readonly id: string;
  readonly title: string;
  readonly value: number;
};

interface IDashboardStateController {
  setWidgets(widgets: readonly DashboardWidgetInput[]): void;
  setLoading(loading: boolean): void;
  setSelectedWidgetId(id: string | null): void;
}

/**
 * Page Object for the dashboard plugin rendered inside `plugin-host`.
 *
 * Tests interact only with this object — they never touch raw selectors or
 * `page.evaluate` directly. The object encapsulates two kinds of access:
 *
 *   - DOM locators for what the user sees;
 *   - bridge access for both DIRECTIONS of the framework boundary —
 *     reading recorded calls (plugin → framework) and pushing state
 *     into the mock store (framework → plugin via Signals).
 */
export class DashboardPage {
  readonly root: Locator;
  readonly loadButton: Locator;
  readonly loading: Locator;
  readonly empty: Locator;
  readonly details: Locator;
  readonly detailsEmpty: Locator;

  constructor(private readonly page: Page) {
    this.root = page.getByTestId('dashboard');
    this.loadButton = page.getByTestId('load-btn');
    this.loading = page.getByTestId('loading');
    this.empty = page.getByTestId('empty');
    this.details = page.getByTestId('details');
    this.detailsEmpty = page.getByTestId('details-empty');
  }

  async goto(): Promise<void> {
    await this.page.goto('/');
    await this.root.waitFor();
    await this.resetBridge();
  }

  widget(id: string): Locator {
    return this.page.getByTestId(`widget-${id}`);
  }

  selectButton(id: string): Locator {
    return this.page.getByTestId(`select-${id}`);
  }

  refreshButton(id: string): Locator {
    return this.page.getByTestId(`refresh-${id}`);
  }

  // ---- plugin → framework: read recorded calls -------------------------

  async getBridgeCalls(): Promise<BridgeCall[]> {
    return this.page.evaluate(() => window.__pluginHostBridge?.calls ?? []);
  }

  async getCallsFor(method: string): Promise<BridgeCall[]> {
    return this.page.evaluate(
      (m) => window.__pluginHostBridge?.callsFor(m) ?? [],
      method,
    );
  }

  async resetBridge(): Promise<void> {
    await this.page.evaluate(() => window.__pluginHostBridge?.reset());
  }

  // ---- framework → plugin: push state into the mock --------------------
  //
  // These helpers go through the controller registered by the mock under
  // the `dashboard` name. Calling them mutates the mock's internal signals
  // in the browser, which causes the plugin's UI to re-render via the same
  // signal-graph it would use against the real framework.

  async setWidgets(widgets: readonly DashboardWidgetInput[]): Promise<void> {
    await this.page.evaluate((next) => {
      window.__pluginHostBridge
        ?.controller<IDashboardStateController>('dashboard')
        ?.setWidgets(next);
    }, widgets);
  }

  async setLoading(loading: boolean): Promise<void> {
    await this.page.evaluate((next) => {
      window.__pluginHostBridge
        ?.controller<IDashboardStateController>('dashboard')
        ?.setLoading(next);
    }, loading);
  }

  async setSelectedWidgetId(id: string | null): Promise<void> {
    await this.page.evaluate((next) => {
      window.__pluginHostBridge
        ?.controller<IDashboardStateController>('dashboard')
        ?.setSelectedWidgetId(next);
    }, id);
  }
}
