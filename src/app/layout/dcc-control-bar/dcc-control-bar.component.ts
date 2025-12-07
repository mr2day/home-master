import { Component, inject, signal, computed } from '@angular/core';
import { DccService } from '../../services/dcc';

@Component({
  selector: 'app-dcc-control-bar',
  imports: [],
  templateUrl: './dcc-control-bar.component.html',
  styleUrl: './dcc-control-bar.component.scss'
})
export class DccControlBarComponent {
  dccService = inject(DccService);
  locoAddress = signal(3);
  locoSpeed = signal(0);
  locoDirection = signal(true); // true = forward
  trackPower = signal(false);
  invertDirectionDisplay = signal(false);
  debugCommand = signal('');
  directionLabel = computed(() =>
    this.invertDirectionDisplay()
      ? (this.locoDirection() ? '<- Forward' : 'Backward ->')
      : (this.locoDirection() ? 'Forward ->' : '<- Backward')
  );

  onLocoAddressChange(event: Event): void {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(value) && value >= 1 && value <= 10239) {
      this.locoAddress.set(value);
    }
  }

  async toggleTrackPower(): Promise<void> {
    const newState = !this.trackPower();
    if (!this.dccService.isConnected()) return;
    try {
      await this.dccService.sendCommand(newState ? '<1>' : '<0>');
      this.trackPower.set(newState);
    } catch (error) {
      console.error('Failed to toggle track power:', error);
    }
  }

  async setLocoSpeed(speed: number): Promise<void> {
    const clampedSpeed = Math.max(0, Math.min(126, speed));
    this.locoSpeed.set(clampedSpeed);
    if (this.dccService.isConnected()) {
      try {
        await this.dccService.setLocoSpeed(
          this.locoAddress(),
          clampedSpeed,
          this.locoDirection()
        );
      } catch (error) {
        console.error('Failed to set speed:', error);
      }
    }
  }

  adjustSpeedBy(delta: number): void {
    this.setLocoSpeed(this.locoSpeed() + delta);
  }

  async setDirection(forward: boolean): Promise<void> {
    this.locoDirection.set(forward);
    if (this.dccService.isConnected()) {
      try {
        await this.dccService.setLocoSpeed(
          this.locoAddress(),
          this.locoSpeed(),
          forward
        );
      } catch (error) {
        console.error('Failed to set direction:', error);
      }
    }
  }

  toggleDirection(): Promise<void> {
    return this.setDirection(!this.locoDirection());
  }

  toggleDirectionDisplay(): void {
    this.invertDirectionDisplay.update(v => !v);
  }

  onDebugCommandChange(event: Event): void {
    this.debugCommand.set((event.target as HTMLInputElement).value);
  }

  async sendDebugCommand(): Promise<void> {
    const cmd = this.debugCommand().trim();
    if (!cmd || !this.dccService.isConnected()) return;
    try {
      await this.dccService.sendCommand(cmd);
    } catch (error) {
      console.error('Failed to send debug command:', error);
    }
  }
}
