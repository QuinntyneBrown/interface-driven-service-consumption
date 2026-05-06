import { InjectionToken, Signal } from '@angular/core';

/**
 * Public domain shape used by both the framework implementation and any plugin
 * consumer. A plain data record — no `I` prefix because there is nothing to
 * implement here, just a structure to populate.
 */
export interface DashboardWidget {
  readonly id: string;
  readonly title: string;
  readonly value: number;
}

/**
 * The SERVICE interface plugins consume. Exposes read-only state via Signals
 * plus a small set of commands. The `I` prefix marks this as a behavioral
 * contract whose implementation is swappable at the host boundary.
 */
export interface IDashboardStateStore {
  readonly widgets: Signal<readonly DashboardWidget[]>;
  readonly loading: Signal<boolean>;
  readonly selectedWidgetId: Signal<string | null>;

  loadWidgets(): void;
  selectWidget(id: string): void;
  refreshWidget(id: string): void;
}

/**
 * The handle plugins inject. The plugin library knows ONLY this token and the
 * `IDashboardStateStore` interface above — never a concrete class. The host
 * application decides at composition time which implementation backs this
 * token: the real one (in `app`) or a mock (in `plugin-host`).
 */
export const DASHBOARD_STATE_STORE = new InjectionToken<IDashboardStateStore>(
  'DASHBOARD_STATE_STORE',
);
