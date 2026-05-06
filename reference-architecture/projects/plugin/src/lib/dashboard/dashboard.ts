import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DASHBOARD_STATE_STORE } from 'framework';

/**
 * Plugin component. The ONLY framework symbol it imports is the injection
 * token (and, transitively, the `IDashboardStateStore` interface used to type
 * the inject result). The component has no idea whether it is talking to the
 * real store or a mock.
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
    </section>
  `,
})
export class Dashboard {
  protected readonly store = inject(DASHBOARD_STATE_STORE);
}
