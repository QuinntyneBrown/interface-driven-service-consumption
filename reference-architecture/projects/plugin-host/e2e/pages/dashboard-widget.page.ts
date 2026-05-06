import { Locator, Page } from '@playwright/test';
import type { BridgeCall } from '../../src/app/bridge/playwright-bridge';

/**
 * Page Object for the dashboard plugin rendered inside `plugin-host`.
 *
 * Tests interact only with this object — they never touch raw selectors or
 * `page.evaluate` directly. That keeps every test boundary aligned with the
 * UI surface, exactly like the framework boundary the plugin consumes.
 */
export class DashboardPage {
  readonly root: Locator;
  readonly loadButton: Locator;
  readonly loading: Locator;

  constructor(private readonly page: Page) {
    this.root = page.getByTestId('dashboard');
    this.loadButton = page.getByTestId('load-btn');
    this.loading = page.getByTestId('loading');
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

  /**
   * Read the bridge's recorded calls. This is the ONLY hatch tests use to
   * verify the plugin-to-framework interface boundary.
   */
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
}
