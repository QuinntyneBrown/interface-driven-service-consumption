/**
 * Playwright bridge — a tiny object hung off `window` so that Playwright
 * tests can observe what the plugin asked the (mocked) framework to do.
 *
 * The bridge is intentionally trivial: it records the name and arguments of
 * every call routed through it, exposes a small handful of helpers, and lives
 * exclusively in the `plugin-host` test app. It never ships in `app`.
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
}

declare global {
  interface Window {
    __pluginHostBridge?: IPlaywrightBridge;
  }
}

export function installPlaywrightBridge(): IPlaywrightBridge {
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
  };
  window.__pluginHostBridge = bridge;
  return bridge;
}
