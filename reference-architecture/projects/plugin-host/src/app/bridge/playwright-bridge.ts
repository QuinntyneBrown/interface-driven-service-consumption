/**
 * Playwright bridge — a tiny object hung off `window` so that Playwright
 * tests can both observe what the plugin asked the (mocked) framework to do
 * AND push data INTO the mocked framework so the plugin's reactive UI can
 * be exercised end-to-end.
 *
 * The bridge has two halves:
 *
 *   1. Call recording. Mocks pipe their interface invocations through
 *      `recordCall` so tests can assert the plugin called the framework
 *      contract correctly.
 *
 *   2. Controller registry. Mocks expose a typed "driver" (e.g. setters
 *      for their internal signals) under a name. Tests fetch the controller
 *      from `window.__pluginHostBridge.controller('<name>')` and use it to
 *      push state changes; the plugin's signal-driven UI reacts in the
 *      browser like it would against the real framework.
 *
 * The bridge itself stays domain-agnostic. Specific controller contracts
 * live next to the mocks that implement them.
 *
 * The bridge lives exclusively in the `plugin-host` test app — it never
 * ships in `app`.
 */

export interface BridgeCall {
  readonly method: string;
  readonly args: readonly unknown[];
  readonly ts: number;
}

export interface IPlaywrightBridge {
  readonly calls: BridgeCall[];
  recordCall(method: string, args: readonly unknown[]): void;
  callsFor(method: string): BridgeCall[];
  reset(): void;

  registerController<T extends object>(name: string, controller: T): void;
  controller<T extends object>(name: string): T | undefined;
}

declare global {
  interface Window {
    __pluginHostBridge?: IPlaywrightBridge;
  }
}

export function installPlaywrightBridge(): IPlaywrightBridge {
  const controllers = new Map<string, object>();

  const bridge: IPlaywrightBridge = {
    calls: [],
    recordCall(method, args) {
      this.calls.push({ method, args: [...args], ts: Date.now() });
    },
    callsFor(method) {
      return this.calls.filter((c) => c.method === method);
    },
    reset() {
      this.calls.length = 0;
    },
    registerController(name, controller) {
      controllers.set(name, controller);
    },
    controller<T extends object>(name: string): T | undefined {
      return controllers.get(name) as T | undefined;
    },
  };
  window.__pluginHostBridge = bridge;
  return bridge;
}
