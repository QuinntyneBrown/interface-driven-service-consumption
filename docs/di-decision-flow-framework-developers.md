# DI Decision Flow — Framework Developers

A plain-language guide for Angular developers who are building **a framework or library** that other people will use and extend.

> If you have ~1 year of Angular experience and you've used `@Injectable` and constructor injection, you have all the background you need. The rest is here.

---

## Who this is for

You are a **framework developer** if you are writing code that:

- Will be used by *other* applications you don't control.
- Is meant to be **extended, customized, or overridden** by its consumers.
- Should still work out of the box if a consumer changes nothing.

Framework code lives a different life from app code. Once you publish it, you can't easily change the rules. The decisions you make about dependency injection (DI) up front decide whether your framework is **a joy to extend** or **a fork-or-leave-it** situation.

---

## A 30-second refresher on Angular DI

Angular has three main ways to "register" something so other code can use it:

| Approach | What it means in plain English |
|---|---|
| `@Injectable({ providedIn: 'root' })` | "There's one of these for the whole app. Anyone can ask for it." |
| `InjectionToken` | "Here's a labeled slot. Whoever wants to fill it can." |
| `providers: [...]` on a component | "Each time this component shows up, give it its own fresh copy." |

For framework authors, the **second one (tokens)** matters far more than it does for app developers. Tokens are how you build seams that consumers can plug into.

---

## The big idea: tokens are the API

When you write a normal app, you usually inject **classes** directly:

```ts
constructor(private logger: LoggerService) {}
```

That's fine inside one app. But the moment another team picks up your framework and says *"can I swap out the logger for my own?"* — you have a problem. They can't, easily, because their code already imports the concrete `LoggerService` class.

The fix is to give them a **label** to inject instead of a class:

```ts
constructor(@Inject(LOGGER) private logger: Logger) {}
```

Now the consumer decides what fills `LOGGER`. You ship a sensible default. They override only when they want to. Everyone is happy.

This is the heart of every decision below.

---

## The decision tree, in order

The diagram (`di-decision-flow-framework-developers.png`) walks through three questions. Ask them **in order** and stop at the first "yes."

### Question 1 — Is this a public extension point?

A "public extension point" is something you *want* consumers to be able to plug into or replace. If yes, **use an `InjectionToken`** — never a concrete class.

There are two flavors:

#### 1a. Multiple consumers may contribute (`multi: true`)

Use this when the answer is **"the more, the merrier"** — every contribution adds to a list, none of them replace each other.

```ts
export interface MenuItem { label: string; route: string; }
export const MENU_ITEMS = new InjectionToken<MenuItem[]>('MENU_ITEMS');
```

Consumers register their items:

```ts
providers: [
  { provide: MENU_ITEMS, useValue: { label: 'Reports', route: '/reports' }, multi: true }
]
```

And your framework collects them all:

```ts
constructor(@Inject(MENU_ITEMS) private items: MenuItem[]) {}
```

**Examples in real Angular:** `ROUTES`, `HTTP_INTERCEPTORS`, `APP_INITIALIZER` — they're all multi tokens because the framework knew that many parties would want to contribute.

**When you want this:** routes, plugins, interceptors, validators, command handlers, anything where "all of the above" is the right answer.

#### 1b. One swappable implementation

Use this when the answer is **"there can be only one, but the consumer should choose which one"** — the contract is fixed, the implementation is replaceable.

```ts
export interface ChartRenderer { render(data: number[]): void; }

export const CHART_RENDERER = new InjectionToken<ChartRenderer>('CHART_RENDERER', {
  providedIn: 'root',
  factory: () => new DefaultChartRenderer(),
});
```

Two important things happen here:

1. **You ship a default** via the `factory`. Apps that do nothing still get a working framework.
2. **Apps can override** by providing the token at their own root:

```ts
providers: [{ provide: CHART_RENDERER, useClass: FancyRenderer }]
```

**When you want this:** swappable backends, formatters, theming engines, error handlers, storage adapters — any "policy" decision an app should be able to make.

#### Why never expose a concrete class for an extension point?

Because the moment your code looks like:

```ts
constructor(private renderer: DefaultChartRenderer) {}   // ❌
```

…consumers can't replace `DefaultChartRenderer` without forking your framework. The concrete class is the wrong thing to depend on. **Always depend on the contract (the token), never the implementation.**

---

### Question 2 — Does each instance need its own state?

**If yes: use component (or directive) `providers`.**

Some framework primitives are inherently *per-instance*. Think about Angular's own `FormGroup` directive — every form has its own state. Imagine if all forms in your app shared one `FormGroup` instance. Chaos.

If your framework provides something like:

- A form controller
- A dialog reference
- A table row state
- An overlay or popover state machine
- A directive that needs local state

…then it should be provided **on the component or directive**, not at the root:

```ts
@Component({
  selector: 'fx-form',
  providers: [FormController],   // <-- new copy per <fx-form>
  ...
})
export class FormComponent { ... }
```

Angular creates a fresh `FormController` for each `<fx-form>` and tears it down when the form is destroyed. The lifetime is bound to the host. That's the whole reason this option exists.

**The signal:** if it would be a bug for two consumers to share the same instance, it belongs at the component level.

---

### Question 3 — Is it a shared, stateless singleton?

**If yes: `@Injectable({ providedIn: 'root' })` for app-wide; or `providedIn: SomeFeatureModule` for lazy features.**

This covers the framework's *internal helpers* — things consumers don't know about and don't need to override. Loggers, registries, pure utility services.

```ts
@Injectable({ providedIn: 'root' })
export class FrameworkRegistry { ... }
```

**Why `providedIn: 'root'` is the default:**

- One copy for the whole app — efficient and predictable.
- **Tree-shakeable.** If no app code ever injects this service, Angular drops it from the final bundle. Apps don't pay for what they don't use.

**When to scope to a feature instead:**

If a service only matters once a particular feature loads (a router-only helper, a chart-only renderer, a modal-only animation engine), provide it on that feature's lazy route or module:

```ts
{
  path: 'charts',
  providers: [ChartAnimationEngine],
  loadChildren: () => import('./charts.routes'),
}
```

The service won't even be created until the user navigates to `/charts`. Apps that never touch charts get a smaller bundle and faster startup.

---

## The cheat sheet

| Situation | Use |
|---|---|
| Many consumers should contribute | `InjectionToken<T[]>` with `multi: true` |
| One swappable implementation | `InjectionToken<T>` + default factory at `'root'` |
| Per-instance state (form, dialog, row) | Component / directive `providers: []` |
| Internal app-wide singleton | `providedIn: 'root'` |
| Internal feature-only singleton | `providedIn: SomeFeatureModule` (or route providers) |

---

## Guardrails for framework authors

**1. Prefer tokens over classes for any public seam.**
A class is a closed door. A token is a labeled slot. Frameworks need slots.

**2. Tokens are how you make interfaces injectable.**
Angular's DI matches by class reference at runtime. A TypeScript `interface` doesn't exist at runtime — so you can't inject one directly. Tokens are the workaround. If your contract is an interface, you *need* a token.

**3. `providedIn: 'root'` is for defaults you expect apps to override, or for genuinely internal helpers.**
Don't default to `'root'` for everything. Ask: "should an app be able to swap this?" If yes, the *token* lives at root, not the class.

**4. Reach for component-level providers when lifetime matters.**
If the service should be born and die with a host element, that's a component provider — not a clever workaround on a singleton.

**5. Never re-provide a token you didn't define.**
If your framework consumes someone else's token (say, `HTTP_INTERCEPTORS`), don't override it at your library's root. That breaks the consuming app's expectations.

**6. Document your tokens like API.**
Every public token deserves: its contract (interface), its multiplicity (single or multi), when the framework calls into it, and an example of overriding it. Tokens are your public API surface.

---

## Common mistakes framework authors make

**1. Exposing a concrete class as an extension point.**
You can't take it back later. Wrap it in a token now.

**2. Forgetting to ship a default.**
A token with no default forces every consumer to provide one, even those who don't care. Use the `factory` form so the framework "just works."

**3. Putting per-instance state at `providedIn: 'root'`.**
Two consumers, one shared blob of state. Race conditions, bleed-through, mystery bugs. Move it to the component.

**4. Using `multi: true` when there should be only one.**
You'll silently accept many implementations and only use one (or all) — confusing for consumers. Pick: many contributions → `multi`; one swappable → not `multi`.

**5. Putting everything at the root, even feature-specific code.**
Your framework's tree-shaking goes out the window. Scope helpers to the feature that needs them.

---

## A short worked example

You're writing a framework for "data tables" that other teams will use.

| Piece | What kind | Why |
|---|---|---|
| The `<fx-table>` component | (a component) | n/a — components are components |
| `RowSelectionState` | Component `providers` | Each table has its own selection |
| `TABLE_FORMATTERS` (date, money, etc.) | `InjectionToken<Formatter[]>` (`multi: true`) | Apps add their own formatters |
| `SORT_STRATEGY` | `InjectionToken<SortStrategy>` + default | Apps may swap sorting (server vs client) |
| `TableRegistry` (internal log of mounted tables) | `providedIn: 'root'` | Internal, app-wide, stateless |
| `TableAnimations` (only used in animated mode) | `providedIn: AnimatedTableModule` | Lazy — apps that don't animate don't pay |

That single table has touched every branch of the tree. Most real frameworks do.

---

## When you're not sure

Ask yourself, in this order:

1. *Should consumers be able to plug in or replace this?* → `InjectionToken` (multi or single).
2. *Should each usage have its own state?* → component / directive providers.
3. *Is it a shared internal helper?* → `providedIn: 'root'`, or scope to a lazy feature.

That's the whole tree. The diagram next to this doc is the same questions, just visual.
