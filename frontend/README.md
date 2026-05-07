# Interface-Driven Service Consumption — Angular reference architecture

A small Angular workspace that demonstrates **interface-driven service
consumption**: plugin code depends only on interfaces (handed out as
`InjectionToken`s), never on concrete implementations. Implementations are
chosen at the application boundary — a real one in production, a mock one
in the test host.

## Project layout

```
projects/
├── framework/      Angular library: service contracts (interface + token) + real impls
├── plugin/         Angular library: UI components that inject framework TOKENS only
├── app/            Angular app: wires plugin + REAL framework store
└── plugin-host/    Angular app: wires plugin + MOCK framework store + window bridge
    └── e2e/        Playwright tests using Page Object Model
```

### Dependency rules

| From          | Depends on                                  |
| ------------- | ------------------------------------------- |
| `framework`   | (no project deps)                           |
| `plugin`      | `framework` — only contract files           |
| `app`         | `framework`, `plugin`                       |
| `plugin-host` | `framework` (contracts), `plugin`, Playwright |

`plugin` never imports concrete framework classes — only the contract files
that export interfaces and `InjectionToken`s.

## Quickstart

```sh
npm install
npm run test:e2e:install     # one-time: install Playwright Chromium
npm run build:libs           # build framework + plugin into dist/ once
```

Both apps consume `framework` and `plugin` from `dist/`, so the libraries
must be built (or watching) before the apps will serve. For day-to-day
development, run watchers in two extra terminals:

```sh
# terminal 1
npm run watch:framework

# terminal 2
npm run watch:plugin

# terminal 3 — real wiring at http://localhost:4200
npm run start:app

# (or) mock wiring at http://localhost:4201
npm run start:plugin-host
```

Run the Playwright suite (it brings up `plugin-host` for you):

```sh
npm run build:libs
npm run test:e2e
```

## Naming convention

- **Service interfaces** (have methods): `I` prefix — `IDashboardStateStore`,
  `IPlaywrightBridge`.
- **Service implementations**: take the unprefixed name —
  `class DashboardStateStore implements IDashboardStateStore`. No `Impl`
  suffix.
- **Data DTOs / models** (no methods): no prefix — `DashboardWidget`,
  `BridgeCall`.
- **Injection tokens**: `SCREAMING_SNAKE_CASE` matching the interface —
  `DASHBOARD_STATE_STORE` for `IDashboardStateStore`.

## Documentation

- [docs/architecture.md](docs/architecture.md) — overall picture and rules
- [docs/injection-token-pattern.md](docs/injection-token-pattern.md) — how
  the contract / token / impl split works, with a step-by-step checklist
- [docs/bridge-pattern.md](docs/bridge-pattern.md) — how the window bridge
  lets Playwright assert on mock interface calls

## Where to start reading the code

Open
`projects/framework/src/lib/stores/dashboard-state.store.contract.ts`
and follow the `DASHBOARD_STATE_STORE` token through `plugin`, `app`, and
`plugin-host`.
