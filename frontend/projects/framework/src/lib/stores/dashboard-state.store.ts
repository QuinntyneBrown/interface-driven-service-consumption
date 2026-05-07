import { Injectable, inject, signal } from '@angular/core';
import {
  DASHBOARD_WIDGET_SERVICE,
  IDashboardWidgetService,
} from '../services/dashboard-widget.service.contract';
import {
  DashboardWidget,
  IDashboardStateStore,
} from './dashboard-state.store.contract';

@Injectable({ providedIn: 'root' })
export class DashboardStateStore implements IDashboardStateStore {
  private readonly widgetService: IDashboardWidgetService = inject(
    DASHBOARD_WIDGET_SERVICE,
  );

  private readonly _widgets = signal<readonly DashboardWidget[]>([]);
  private readonly _loading = signal(false);
  private readonly _selectedWidgetId = signal<string | null>(null);

  readonly widgets = this._widgets.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly selectedWidgetId = this._selectedWidgetId.asReadonly();

  loadWidgets(): void {
    this._loading.set(true);
    this.widgetService.getWidgets().subscribe({
      next: (widgets) => {
        this._widgets.set(widgets);
        this._loading.set(false);
      },
      error: () => {
        this._loading.set(false);
      },
    });
  }

  selectWidget(id: string): void {
    this._selectedWidgetId.set(id);
  }

  refreshWidget(id: string): void {
    this._widgets.update((list) =>
      list.map((w) => (w.id === id ? { ...w, value: w.value + 1 } : w)),
    );
  }
}
