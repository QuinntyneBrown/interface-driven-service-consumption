/**
 * Playwright bridge for the framework e2e host.
 *
 * Unlike the plugin-host bridge (which RECORDS calls the plugin makes against
 * a mocked framework), this bridge exists so tests can DRIVE the REAL
 * framework store from outside the Angular app:
 *
 *   - Tests pull a typed controller out of `window.__frameworkHostBridge`
 *     and invoke commands on the real `DashboardStateStore`.
 *   - The HTTP boundary is intercepted by Playwright at the network layer
 *     (`page.route`), so no call-recorder is needed at the interface layer.
 *
 * The bridge ships only in `framework-host` — never in `app`.
 */

export interface IPlaywrightBridge {
  registerController<T extends object>(name: string, controller: T): void;
  controller<T extends object>(name: string): T | undefined;
}

declare global {
  interface Window {
    __frameworkHostBridge?: IPlaywrightBridge;
  }
}

export function installPlaywrightBridge(): IPlaywrightBridge {
  const controllers = new Map<string, object>();

  const bridge: IPlaywrightBridge = {
    registerController(name, controller) {
      controllers.set(name, controller);
    },
    controller<T extends object>(name: string): T | undefined {
      return controllers.get(name) as T | undefined;
    },
  };
  window.__frameworkHostBridge = bridge;
  return bridge;
}
