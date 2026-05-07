import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DashboardBridgeController } from './bridge/dashboard-bridge-controller';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  // Eagerly resolve the bridge controller so it registers itself on the
  // Playwright bridge as soon as the app boots. The reference is unused at
  // runtime — the side effect is the registration in the controller's ctor.
  constructor() {
    inject(DashboardBridgeController);
  }
}
