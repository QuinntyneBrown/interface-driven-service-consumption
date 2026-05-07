import { Locator, Page } from '@playwright/test';
// Side-effect import: brings the `Window.__frameworkHostBridge` global
// declaration into the e2e compilation. The bridge module has no Angular
// imports, so it's safe to pull in here.
import '../../src/app/bridge/playwright-bridge';

/**
 * Structural mirrors of the test-facing surface of the framework-host
 * dashboard bridge. Declared locally so the e2e folder stays self-contained
 * and does not depend on Angular's `framework` path alias. The
 * `DashboardBridgeController` is the canonical implementer; these shapes
 * only have to be structurally compatible across the `page.evaluate`
 * boundary.
 */
type DashboardWidgetSnapshot = {
  readonly id: string;
  readonly title: string;
  readonly value: number;
};

interface IDashboardStateSnapshot {
  readonly widgets: readonly DashboardWidgetSnapshot[];
  readonly loading: boolean;
  readonly selectedWidgetId: string | null;
}

interface IDashboardBridgeController {
  loadWidgets(): void;
  selectWidget(id: string): void;
  refreshWidget(id: string): void;
  getState(): IDashboardStateSnapshot;
}

/**
 * Page Object for the framework-host. Tests use it to drive the REAL
 * `DashboardStateStore` and read its current state, without ever touching
 * `page.evaluate` strings inline.
 */
export class FrameworkHostPage {
  readonly root: Locator;

  constructor(private readonly page: Page) {
    this.root = page.getByTestId('framework-host');
  }

  async goto(): Promise<void> {
    await this.page.goto('/');
    await this.root.waitFor();
    // Wait for the bridge controller to be registered. Bootstrap happens
    // shortly after navigation completes; without this poll, tests can race
    // the App component's constructor.
    await this.page.waitForFunction(
      () => Boolean(window.__frameworkHostBridge?.controller('dashboard')),
    );
  }

  async loadWidgets(): Promise<void> {
    await this.page.evaluate(() => {
      window.__frameworkHostBridge
        ?.controller<IDashboardBridgeController>('dashboard')
        ?.loadWidgets();
    });
  }

  async selectWidget(id: string): Promise<void> {
    await this.page.evaluate((next) => {
      window.__frameworkHostBridge
        ?.controller<IDashboardBridgeController>('dashboard')
        ?.selectWidget(next);
    }, id);
  }

  async refreshWidget(id: string): Promise<void> {
    await this.page.evaluate((next) => {
      window.__frameworkHostBridge
        ?.controller<IDashboardBridgeController>('dashboard')
        ?.refreshWidget(next);
    }, id);
  }

  async getState(): Promise<IDashboardStateSnapshot> {
    return this.page.evaluate(() => {
      const controller = window.__frameworkHostBridge?.controller<
        IDashboardBridgeController
      >('dashboard');
      if (!controller) {
        throw new Error('dashboard bridge controller not registered');
      }
      return controller.getState();
    });
  }
}

