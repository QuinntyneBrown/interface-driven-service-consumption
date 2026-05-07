import { provideHttpClient } from '@angular/common/http';
import { ApplicationConfig } from '@angular/core';
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
    provideHttpClient(),
    provideRouter(routes),

    // The composition-root binding for the framework e2e host: the SAME real
    // implementations the production `app` uses are wired here. The test
    // suite verifies framework logic against this real wiring; only the HTTP
    // boundary is mocked at the network layer by Playwright.
    { provide: DASHBOARD_STATE_STORE, useExisting: DashboardStateStore },
    { provide: DASHBOARD_WIDGET_SERVICE, useExisting: DashboardWidgetService },
  ],
};
