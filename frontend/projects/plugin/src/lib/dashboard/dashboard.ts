import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { DASHBOARD_STATE_STORE } from 'framework';

/**
 * Plugin component. The ONLY framework symbol it imports is the injection
 * token (and, transitively, the `IDashboardStateStore` interface used to type
 * the inject result). The component has no idea whether it is talking to the
 * real store or a mock.
 *
 * Visuals are built entirely from Angular Material primitives: a card frame,
 * a list of widgets, Material buttons + icon buttons, a progress bar for the
 * loading state, and a divider between sections.
 *
 * The component is fully driven by Signals: the widget list, loading
 * indicator, and details panel all derive from store signals. When the store
 * pushes new data — whether from a real network call in production or from a
 * test driver in `plugin-host` — the UI re-renders automatically.
 */
@Component({
  selector: 'lib-dashboard',
  standalone: true,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatDividerModule,
    MatIconModule,
    MatListModule,
    MatProgressBarModule,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
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
