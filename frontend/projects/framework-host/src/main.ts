import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { installPlaywrightBridge } from './app/bridge/playwright-bridge';

// Install the bridge BEFORE bootstrap so the dashboard controller (constructed
// during the App component's injector resolution) has a target to register
// against on its very first lifecycle tick.
installPlaywrightBridge();

bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err));
