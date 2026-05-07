# Diagrams

Source files for the diagrams referenced from
[`../architecture.md`](../architecture.md). Each diagram tries to
illustrate **one** idea — read them in order if you are new to the
codebase.

All sources are plain text (no binary checked in) so diffs stay
readable.

## Singleton resolution (draw.io) — read in order

Four small diagrams that build up the DI story step by step.

| #   | File                                                                                       | One-liner                                                                                            |
| --- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| 0   | [`singleton-0-registration-paths.drawio`](singleton-0-registration-paths.drawio)           | Two ways to register — `providedIn: 'root'` on the class OR listing the token in `app.config.ts` providers — both land on the root injector. |
| 1   | [`singleton-1-one-instance.drawio`](singleton-1-one-instance.drawio)                       | Once registered: Angular caches one instance; every `inject(Cls)` returns the same object.          |
| 2   | [`singleton-2-token-alias.drawio`](singleton-2-token-alias.drawio)                         | `useExisting` adds the **token** as a second key pointing to that same cached instance.              |
| 3   | [`singleton-3-useclass-anti-pattern.drawio`](singleton-3-useclass-anti-pattern.drawio)     | ⚠ `useClass` makes a SECOND instance — divergent signals; what NOT to do.                            |

## Architecture flow (draw.io) — read in order

Three small diagrams that build up the test setup step by step.

| #   | File                                                                                       | One-liner                                                                                            |
| --- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| 1   | [`architecture-1-two-processes.drawio`](architecture-1-two-processes.drawio)               | Node and Browser are two processes. The bridge on `window` is the only object both sides share.     |
| 2   | [`architecture-2-call-recording.drawio`](architecture-2-call-recording.drawio)             | Direction 1: click → component → mock → `bridge.calls[]`. Test reads later via `page.evaluate`.     |
| 3   | [`architecture-3-state-driving.drawio`](architecture-3-state-driving.drawio)               | Direction 2: test → `page.evaluate` → controller → `NgZone.run` → signal → OnPush re-render.         |

## PlantUML reference diagrams (`*.puml`)

Use these once the picture above is clear and you want a more formal
view of the symbols and message flow.

| File                                                                       | Diagram type | What it shows                                                                                              |
| -------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------- |
| [`class-diagram.puml`](class-diagram.puml)                                 | class        | Contracts, real impl, mock, controller, bridge, plugin component, and how the composition roots wire them |
| [`component-diagram.puml`](component-diagram.puml)                         | component    | The four projects, allowed dependencies, and the explicitly-forbidden `plugin → real impl` edge            |
| [`sequence-plugin-to-framework.puml`](sequence-plugin-to-framework.puml)   | sequence     | A click in Playwright → plugin → mock → bridge `recordCall` → test asserts on `callsFor`                   |
| [`sequence-framework-to-plugin.puml`](sequence-framework-to-plugin.puml)   | sequence     | A test pushes data via the bridge controller → `NgZone.run` → signal → OnPush re-render → DOM assertion   |

## Tools to render

- **draw.io**: [app.diagrams.net](https://app.diagrams.net), the
  desktop [draw.io app](https://github.com/jgraph/drawio-desktop), or
  the [VS Code extension](https://marketplace.visualstudio.com/items?itemName=hediet.vscode-drawio).
- **PlantUML**: the [PlantUML CLI](https://plantuml.com/download), the
  [VS Code extension](https://marketplace.visualstudio.com/items?itemName=jebbs.plantuml),
  or any service that takes `.puml` input.

## Adding a new diagram

Source-only — never commit rendered PNG/SVG. Keep each diagram
single-idea: if you need a second arrow path or a third concept, that
is usually a second diagram, not a busier first one.
