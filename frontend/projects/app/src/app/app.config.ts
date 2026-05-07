import { provideHttpClient } from '@angular/common/http';
import { ApplicationConfig } from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';

import {
  DASHBOARD_STATE_STORE,
  DASHBOARD_WIDGET_SERVICE,
  DashboardStateStore,
  DashboardWidgetService,
} from 'framework';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideAnimations(),
    provideHttpClient(),
    provideRouter(routes),

    // The composition-root binding: in production the token is satisfied by
    // the REAL framework store. The plugin never sees this line — it only
    // ever asks for `DASHBOARD_STATE_STORE`.
    { provide: DASHBOARD_STATE_STORE, useExisting: DashboardStateStore },
    {
      provide: DASHBOARD_WIDGET_SERVICE,
      useExisting: DashboardWidgetService,
    },
  ],
};
