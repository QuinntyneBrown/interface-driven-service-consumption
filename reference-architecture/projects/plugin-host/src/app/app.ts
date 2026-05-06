import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DashboardWidget } from 'plugin';

@Component({
  selector: 'app-root',
  imports: [DashboardWidget],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
