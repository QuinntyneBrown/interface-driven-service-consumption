import { Injectable, NgZone, inject } from '@angular/core';
import {
  DASHBOARD_STATE_STORE,
  DashboardWidget,
  IDashboardStateStore,
} from 'framework';

/**
 * Snapshot of the store's reactive state, returned in a single `page.evaluate`
 * round-trip. Tests assert on this rather than reaching into Angular signals
 * across the browser boundary.
 */
export interface DashboardStateSnapshot {
  readonly widgets: readonly DashboardWidget[];
  readonly loading: boolean;
  readonly selectedWidgetId: string | null;
}

/**
 * Test-side driver registered on the bridge under `'dashboard'`. Each command
 * delegates to the REAL `IDashboardStateStore` resolved via DI — the whole
 * point of the framework-host suite is to exercise that real implementation.
 *
 * Exposed shape (also implemented by this class):
 *   - loadWidgets / selectWidget / refreshWidget — pass-through to the store.
 *   - getState — synchronous snapshot of the store's signals.
 */
export interface IDashboardBridgeController {
  loadWidgets(): void;
  selectWidget(id: string): void;
  refreshWidget(id: string): void;
  getState(): DashboardStateSnapshot;
}

/**
 * Bootstraps the bridge controller for the dashboard store. The service is
 * created at app startup (injected by the App component) so that by the time
 * Playwright sees the host element, the controller is already on the bridge.
 *
 * Command methods run inside `NgZone.run` because they originate from
 * `page.evaluate` callbacks — without the wrap, the synchronous signal writes
 * inside `loadWidgets()` (and the kicked-off HttpClient request) would land
 * outside Angular's zone.
 */
@Injectable({ providedIn: 'root' })
export class DashboardBridgeController implements IDashboardBridgeController {
  private readonly zone = inject(NgZone);
  private readonly store: IDashboardStateStore = inject(DASHBOARD_STATE_STORE);

  constructor() {
    window.__frameworkHostBridge?.registerController<IDashboardBridgeController>(
      'dashboard',
      this,
    );
  }

  loadWidgets(): void {
    this.zone.run(() => this.store.loadWidgets());
  }

  selectWidget(id: string): void {
    this.zone.run(() => this.store.selectWidget(id));
  }

  refreshWidget(id: string): void {
    this.zone.run(() => this.store.refreshWidget(id));
  }

  getState(): DashboardStateSnapshot {
    return {
      widgets: this.store.widgets(),
      loading: this.store.loading(),
      selectedWidgetId: this.store.selectedWidgetId(),
    };
  }
}
