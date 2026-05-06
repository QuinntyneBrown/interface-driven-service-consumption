import { Injectable, signal } from '@angular/core';
import { DashboardWidget, IDashboardStateStore } from 'framework';

/**
 * Test-side driver for the mock store. Playwright reaches this through
 * `window.__pluginHostBridge.controller<IDashboardStateController>('dashboard')`
 * to push data into the mock's signals and observe the plugin UI react.
 *
 * This contract is intentionally separate from `IDashboardStateStore` — the
 * plugin must NEVER see it. It exists only so tests can drive state from
 * outside the Angular app.
 */
export interface IDashboardStateController {
  setWidgets(widgets: readonly DashboardWidget[]): void;
  setLoading(loading: boolean): void;
  setSelectedWidgetId(id: string | null): void;
}

/**
 * Mock implementation of the `IDashboardStateStore` contract used by the
 * plugin-host app during Playwright runs. Two responsibilities:
 *
 *   - Every command method routes through `window.__pluginHostBridge` so tests
 *     can assert on call arguments WITHOUT exercising the real framework.
 *   - The internal signals are exposed to tests via the `dashboard`
 *     controller, letting tests simulate framework-driven state changes
 *     (e.g. data arriving, loading flipping) and verify the plugin's
 *     signal-driven UI updates.
 *
 * Only the contract is imported from `framework` — the real
 * `DashboardStateStore` class is intentionally absent from this bundle.
 */
@Injectable({ providedIn: 'root' })
export class DashboardStateStoreMock
  implements IDashboardStateStore, IDashboardStateController
{
  private readonly _widgets = signal<readonly DashboardWidget[]>([
    { id: 'w1', title: 'Mock Sales', value: 1 },
    { id: 'w2', title: 'Mock Visits', value: 2 },
  ]);
  private readonly _loading = signal(false);
  private readonly _selectedWidgetId = signal<string | null>(null);

  readonly widgets = this._widgets.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly selectedWidgetId = this._selectedWidgetId.asReadonly();

  constructor() {
    window.__pluginHostBridge?.registerController<IDashboardStateController>(
      'dashboard',
      this,
    );
  }

  // IDashboardStateStore — recorded for plugin → framework assertions.
  loadWidgets(): void {
    window.__pluginHostBridge?.recordCall('loadWidgets', []);
  }

  selectWidget(id: string): void {
    window.__pluginHostBridge?.recordCall('selectWidget', [id]);
    this._selectedWidgetId.set(id);
  }

  refreshWidget(id: string): void {
    window.__pluginHostBridge?.recordCall('refreshWidget', [id]);
  }

  // IDashboardStateController — driven from Playwright via the bridge.
  setWidgets(widgets: readonly DashboardWidget[]): void {
    this._widgets.set(widgets);
  }

  setLoading(loading: boolean): void {
    this._loading.set(loading);
  }

  setSelectedWidgetId(id: string | null): void {
    this._selectedWidgetId.set(id);
  }
}
