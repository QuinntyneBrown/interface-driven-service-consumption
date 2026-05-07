import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { DashboardWidget } from '../stores/dashboard-state.store.contract';
import { IDashboardWidgetService } from './dashboard-widget.service.contract';

@Injectable({ providedIn: 'root' })
export class DashboardWidgetService implements IDashboardWidgetService {
  private readonly http = inject(HttpClient);
  private readonly url = '/api/dashboardwidgets';

  getWidgets(): Observable<readonly DashboardWidget[]> {
    return this.http.get<readonly DashboardWidget[]>(this.url);
  }
}
