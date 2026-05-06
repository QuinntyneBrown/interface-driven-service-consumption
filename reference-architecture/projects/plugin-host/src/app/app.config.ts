import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';

import { DASHBOARD_STATE_STORE } from 'framework';
import { DashboardStateStoreMock } from './mocks/dashboard-state.store.mock';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),

    // The composition-root binding for the test host: the same token the
    // plugin asks for is satisfied by the MOCK. The plugin code path is
    // unchanged — only the binding differs from `app`.
    DashboardStateStoreMock,
    { provide: DASHBOARD_STATE_STORE, useExisting: DashboardStateStoreMock },
  ],
};
