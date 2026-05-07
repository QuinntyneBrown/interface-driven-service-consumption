import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { DashboardWidget } from '../stores/dashboard-state.store.contract';

/**
 * Contract for the data-access service that fetches dashboard widgets from
 * the backend. The store depends on this interface, never on a concrete
 * HTTP implementation.
 */
export interface IDashboardWidgetService {
  getWidgets(): Observable<readonly DashboardWidget[]>;
}

export const DASHBOARD_WIDGET_SERVICE =
  new InjectionToken<IDashboardWidgetService>('DASHBOARD_WIDGET_SERVICE');
