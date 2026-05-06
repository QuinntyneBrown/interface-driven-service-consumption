import { Injectable, signal } from '@angular/core';
import {
  DashboardWidget,
  IDashboardStateStore,
} from './dashboard-state.store.contract';

@Injectable({ providedIn: 'root' })
export class DashboardStateStore implements IDashboardStateStore {
  private readonly _widgets = signal<readonly DashboardWidget[]>([]);
  private readonly _loading = signal(false);
  private readonly _selectedWidgetId = signal<string | null>(null);

  readonly widgets = this._widgets.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly selectedWidgetId = this._selectedWidgetId.asReadonly();

  loadWidgets(): void {
    this._loading.set(true);
    setTimeout(() => {
      this._widgets.set([
        { id: 'w1', title: 'Sales', value: 1240 },
        { id: 'w2', title: 'Visits', value: 9821 },
        { id: 'w3', title: 'Signups', value: 137 },
      ]);
      this._loading.set(false);
    }, 250);
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
