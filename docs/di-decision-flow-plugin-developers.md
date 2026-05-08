# DI Decision Flow — Plugin Developers

A plain-language guide for Angular developers who are building **plugins** that extend an existing app or framework.

> If you have ~1 year of Angular experience and you've used `@Injectable` and constructor injection, you have all the background you need. The rest is here.

---

## Who this is for

You are a **plugin developer** if you are writing code that:

- Slots into a host application (a "shell") that someone else built.
- Adds a feature, widget, command, route, or behavior.
- Should be able to be added or removed without changing the host.

The host has rules. Your job is to play by them. This guide tells you *where* in Angular's dependency injection (DI) system your code belongs.

---

## A 30-second refresher on Angular DI

Angular has three main ways to "register" something so other code can use it:

| Approach | What it means in plain English |
|---|---|
| `@Injectable({ providedIn: 'root' })` | "There's one of these for the whole app. Anyone can ask for it." |
| `InjectionToken` | "Here's a label. Whoever wants to fill in this label can." |
| `providers: [...]` on a component | "Each time this component shows up, give it its own fresh copy." |

That's it. The rest of this document is about **which one to pick when you're writing a plugin**.

---

## The decision tree, in order

The diagram (`di-decision-flow-plugin-developers.png`) walks through five questions. Ask them **in order** and stop at the first "yes."

### Question 1 — Does the host expose a token for what I'm doing?

**If yes: register against the host's token. Don't invent your own.**

A "token" is a labeled slot the host has set up to collect contributions. The host might have written something like:

```ts
export const WIDGET_REGISTRY = new InjectionToken<Widget[]>('WIDGET_REGISTRY');
```

That tells you: *"I, the host, will collect every `Widget` anyone hands me through this slot, and I'll use them all."*

Your job as a plugin author is to drop your widget into that slot:

```ts
providers: [
  { provide: WIDGET_REGISTRY, useClass: MyChartWidget, multi: true }
]
```

The `multi: true` part is what lets many plugins all contribute at once without overwriting each other.

**Common host tokens you've probably seen:**

- `ROUTES` — every routing module pushes its routes into this.
- `HTTP_INTERCEPTORS` — every interceptor (auth, logging, retries) registers here.
- Custom ones the host invented: `COMMANDS`, `MENU_ITEMS`, `WIDGET_REGISTRY`, etc.

**Why this is the right answer:** the host has *promised* to look at this slot. If you create your own token instead, the host will never see what you registered.

---

### Question 2 — Is the service stateful and tied to a single component?

**If yes: put it in that component's `providers` array.**

"Stateful" means it remembers things between method calls. "Tied to a component" means each component instance should have its **own** copy with its **own** memory — not share with everyone else.

```ts
@Component({
  selector: 'plugin-wizard',
  providers: [WizardStateService],   // <-- here
  templateUrl: './wizard.component.html',
})
export class WizardComponent { ... }
```

When Angular creates a `WizardComponent`, it creates a fresh `WizardStateService` for it. When the wizard goes away, so does its state. Two wizards open at once? Two independent copies.

**When you want this:**

- A form's draft state.
- A wizard's "current step" tracker.
- A dialog's local state.
- A table row's expand/collapse state.
- A small "store" that lives only as long as your view does.

**Why not `providedIn: 'root'`?** Because `'root'` means **one shared copy for the whole app**. If two wizards open and they share state, they overwrite each other. Bugs everywhere.

---

### Question 3 — Does the host already provide this?

**If yes: just inject it. Don't re-register it.**

Hosts usually provide common tools — a logger, an HTTP client, a notification service, a current-user service. As a plugin, you should **inject and use** what the host gave you, not create your own copy.

```ts
constructor(private logger: HostLoggerService) {}   // ✅ uses the host's logger
```

**The trap to avoid:**

```ts
@Component({
  providers: [HostLoggerService],   // ❌ creates a SECOND logger for this component
})
```

That second logger has its own state. If the host's logger is buffering messages or counting errors, your plugin's copy doesn't see any of that. You've broken the shared world the host built.

**Rule of thumb:** if you didn't invent it, don't re-provide it.

---

### Question 4 — Might other plugins or apps want to override your service?

**If yes: define your own `InjectionToken` and ship a default.**

Even as a plugin, sometimes *you* become a mini-framework — other people build on top of you. If they should be able to swap out your implementation, expose a token instead of a concrete class.

```ts
// Define the contract
export interface ChartRenderer { render(data: number[]): void; }
export const CHART_RENDERER = new InjectionToken<ChartRenderer>('CHART_RENDERER', {
  providedIn: 'root',
  factory: () => new DefaultChartRenderer(),
});
```

Now other developers can write:

```ts
providers: [{ provide: CHART_RENDERER, useClass: FancyChartRenderer }]
```

…and replace your default without forking your plugin.

**When to bother:** if there's any chance someone will say "I love your plugin but I want to change *one part* of it," reach for a token.

**When not to bother:** if it's purely internal — nobody outside your plugin should know it exists — skip the token and use a regular class.

---

### Question 5 — None of the above?

**Then it's just an internal singleton. Use `providedIn: 'root'` or scope it to your lazy module.**

If your service is:

- Shared across your whole plugin (not per-component),
- Stateless or has shared state on purpose,
- Internal (nobody overrides it),

…then a regular `@Injectable({ providedIn: 'root' })` is fine.

```ts
@Injectable({ providedIn: 'root' })
export class MyPluginAnalyticsService { ... }
```

**Better, if your plugin is lazy-loaded:** scope it to the lazy feature so the host's main bundle doesn't pay for it.

```ts
// In the plugin's lazy-loaded routes file
{
  path: 'my-plugin',
  providers: [MyPluginAnalyticsService],
  loadChildren: () => import('./plugin.routes'),
}
```

This way the service is only created once a user actually opens your plugin. If they never visit it, Angular never builds it.

---

## The cheat sheet

| Situation | Use |
|---|---|
| Host has a token for this kind of contribution | Host's token, often `multi: true` |
| Per-component state (forms, wizards, dialogs) | Component `providers: []` |
| Host already gives you the service | Just inject it |
| You're exposing an extension point of your own | Your own `InjectionToken` + default factory |
| Plain internal singleton | `providedIn: 'root'` (or lazy module providers) |

---

## Common mistakes plugin authors make

**1. Re-providing a host service "to be safe."**
You now have two of them. Shared state is broken. Inject; don't re-provide.

**2. Inventing your own `WIDGET_REGISTRY` when the host already has one.**
The host won't read yours. Use the host's token.

**3. Putting per-form state in `providedIn: 'root'`.**
Two forms now fight over the same memory. Move it to component `providers`.

**4. Eagerly registering everything at the root.**
Your plugin loads even when nobody opens it. Scope to the lazy module/route instead.

**5. Forgetting `multi: true` on a multi token.**
Without it, your contribution **replaces** every other plugin's contribution. Most extension-point tokens are multi — read the host's docs.

---

## When you're not sure

Ask yourself, in this order:

1. *Did the host build a slot for this?* → use the slot.
2. *Should each component have its own?* → component providers.
3. *Did the host already build it?* → just inject it.
4. *Will anyone replace this?* → use a token.
5. *None of the above?* → `providedIn: 'root'`.

That's the whole tree. The diagram next to this doc is the same questions, just visual.
