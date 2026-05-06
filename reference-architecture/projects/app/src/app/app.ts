import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Dashboard } from 'plugin';

@Component({
  selector: 'app-root',
  imports: [Dashboard],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
