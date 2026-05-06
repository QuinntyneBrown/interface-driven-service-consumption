# Architecture overview

This workspace is a small but complete demonstration of **interface-driven
service consumption** in Angular. Plugin code talks to framework services
only through interfaces handed out as `InjectionToken`s. Whoever bootstraps
the application chooses which implementation backs each token.

That single discipline is what makes the whole thing testable end-to-end
without ever running the real framework.

## The four projects

```
projects/
├── framework/      Angular library
│                   ├─ Service contracts: interface + InjectionToken (the WHAT)
│                   └─ Real service implementations (the HOW, for production)
│
├── plugin/         Angular library
│                   └─ UI components that inject framework TOKENS only.
│                      No reference to any concrete framework class.
│
├── app/            Angular application — production wiring
│                   └─ Provides REAL framework implementations behind the tokens
│
└── plugin-host/    Angular application — Playwright test wiring
                    ├─ Provides MOCK implementations behind the tokens
                    ├─ Installs a window bridge that records mock calls
                    └─ e2e/ — Playwright POM tests assert on the bridge
```

## Dependency rules (read these first)

| From          | May depend on                              |
| ------------- | ------------------------------------------ |
| `framework`   | nothing in this workspace                  |
| `plugin`      | `framework` — but only `*.contract.ts` files (interfaces + tokens) |
| `app`         | `framework`, `plugin`                      |
| `plugin-host` | `framework` (contracts), `plugin`, `@playwright/test` |

The crucial rule is **"plugin imports tokens, never classes"**. If you ever
find yourself adding `import { DashboardStateStore } from 'framework'`
inside `projects/plugin/`, stop — you are about to fuse the plugin to a
specific implementation and the plugin-host can no longer mock it.

## Why this shape?

- **Plugins are deployed independently of the host.** They cannot know
  which implementation is wired up. Tokens give them a stable handle.
- **Tests should pin the contract, not the implementation.** Playwright
  asserts on what the plugin asked the framework to do — not on the
  framework's own behavior, which has its own tests elsewhere.
- **The mock and the real impl share an interface.** If the contract
  evolves, the TypeScript compiler forces both sides to keep up.

## Reading order for new contributors

1. `projects/framework/src/lib/stores/dashboard-state.store.contract.ts`
   — the interface and token. Start here.
2. `projects/framework/src/lib/stores/dashboard-state.store.ts` — the real
   implementation.
3. `projects/plugin/src/lib/dashboard/dashboard.ts` — the plugin component.
   Note it imports only the token from `framework`.
4. `projects/app/src/app/app.config.ts` — production wiring. Note the
   `useExisting: DashboardStateStore` line.
5. `projects/plugin-host/src/app/app.config.ts` — test wiring.
   `useExisting: DashboardStateStoreMock`.
6. `projects/plugin-host/src/app/mocks/dashboard-state.store.mock.ts` —
   the mock that records calls through the bridge.
7. `projects/plugin-host/src/app/bridge/playwright-bridge.ts` — the bridge
   itself.
8. `projects/plugin-host/e2e/` — POM and tests.

For deeper dives see:
- [injection-token-pattern.md](injection-token-pattern.md)
- [bridge-pattern.md](bridge-pattern.md)
