import { Injectable, signal } from '@angular/core';
import { DashboardWidget, IDashboardStateStore } from 'framework';

/**
 * Mock implementation of the `IDashboardStateStore` contract used by the
 * plugin-host app during Playwright runs. Every command method routes
 * through `window.__pluginHostBridge` so tests can assert on call arguments
 * WITHOUT exercising the real framework implementation.
 *
 * Only the contract is imported from `framework` — the real
 * `DashboardStateStore` class is intentionally absent from this bundle.
 */
@Injectable({ providedIn: 'root' })
export class DashboardStateStoreMock implements IDashboardStateStore {
  private readonly _widgets = signal<readonly DashboardWidget[]>([
    { id: 'w1', title: 'Mock Sales', value: 1 },
    { id: 'w2', title: 'Mock Visits', value: 2 },
  ]);
  private readonly _loading = signal(false);
  private readonly _selectedWidgetId = signal<string | null>(null);

  readonly widgets = this._widgets.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly selectedWidgetId = this._selectedWidgetId.asReadonly();

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
}
