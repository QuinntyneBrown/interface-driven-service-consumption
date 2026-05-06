import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { installPlaywrightBridge } from './app/bridge/playwright-bridge';

// Install the bridge BEFORE bootstrap so that any constructor-time recordCall
// from the mock store has a target to write to.
installPlaywrightBridge();

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
