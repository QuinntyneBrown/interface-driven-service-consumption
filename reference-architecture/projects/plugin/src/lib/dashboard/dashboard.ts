import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { DASHBOARD_STATE_STORE } from 'framework';

/**
 * Plugin component. The ONLY framework symbol it imports is the injection
 * token (and, transitively, the `IDashboardStateStore` interface used to type
 * the inject result). The component has no idea whether it is talking to the
 * real store or a mock.
 *
 * The component is fully driven by Signals: the widget list, loading
 * indicator, and details panel all derive from store signals. When the store
 * pushes new data — whether from a real network call in production or from a
 * test driver in `plugin-host` — the UI re-renders automatically.
 */
@Component({
  selector: 'lib-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host { display: block; font-family: system-ui, sans-serif; }
    section { border: 1px solid #ddd; border-radius: 8px; padding: 1rem; }
    header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    ul { list-style: none; padding: 0; margin: 0; }
    li { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; border-bottom: 1px solid #eee; }
    li.selected { background: #eef6ff; }
    li:last-child { border-bottom: none; }
    aside { margin-top: 1rem; padding-top: 0.75rem; border-top: 1px dashed #ccc; }
    aside h3 { margin: 0 0 0.25rem 0; font-size: 0.95rem; }
    button { cursor: pointer; }
  `,
  template: `
    <section data-testid="dashboard">
      <header>
        <h2>Dashboard</h2>
        <button data-testid="load-btn" type="button" (click)="store.loadWidgets()">
          Load
        </button>
      </header>

      @if (store.loading()) {
        <p data-testid="loading">Loading…</p>
      }

      <ul>
        @for (w of store.widgets(); track w.id) {
          <li
            [attr.data-testid]="'widget-' + w.id"
            [class.selected]="w.id === store.selectedWidgetId()"
          >
            <span style="flex: 1;">{{ w.title }}: {{ w.value }}</span>
            <button
              [attr.data-testid]="'select-' + w.id"
              type="button"
              (click)="store.selectWidget(w.id)"
            >Select</button>
            <button
              [attr.data-testid]="'refresh-' + w.id"
              type="button"
              (click)="store.refreshWidget(w.id)"
            >Refresh</button>
          </li>
        } @empty {
          <li data-testid="empty">No widgets loaded yet.</li>
        }
      </ul>

      <aside>
        <h3>Selected</h3>
        @if (selectedWidget(); as w) {
          <p data-testid="details">{{ w.title }} — {{ w.value }}</p>
        } @else {
          <p data-testid="details-empty">No widget selected.</p>
        }
      </aside>
    </section>
  `,
})
export class Dashboard {
  protected readonly store = inject(DASHBOARD_STATE_STORE);

  /**
   * Derived view of the currently selected widget. Recomputes whenever
   * either the widget list OR the selected id changes — so a test that
   * pushes new widgets while a selection is active sees the panel update.
   */
  protected readonly selectedWidget = computed(() => {
    const id = this.store.selectedWidgetId();
    if (id === null) return null;
    return this.store.widgets().find((w) => w.id === id) ?? null;
  });
}
