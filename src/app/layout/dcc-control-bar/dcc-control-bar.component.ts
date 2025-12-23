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
  debugCommand = signal('');
  arrowLeft = computed(() =>
    this.dccService.invertDirectionDisplay()
      ? this.dccService.locoDirection()
      : !this.dccService.locoDirection()
  );

  onLocoAddressChange(event: Event): void {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(value) && value >= 1 && value <= 10239) {
      this.dccService.setLocoAddress(value);
    }
  }

  adjustLocoAddress(delta: number): void {
    const next = Math.max(1, Math.min(10239, this.dccService.locoAddress() + delta));
    this.dccService.setLocoAddress(next);
  }

  async toggleTrackPower(): Promise<void> {
    const newState = !this.dccService.trackPower();
    if (!this.dccService.isConnected()) return;
    await this.dccService.setTrackPower(newState);
  }

  async setLocoSpeed(speed: number): Promise<void> {
    const clampedSpeed = Math.max(0, Math.min(126, speed));
    this.dccService.locoSpeed.set(clampedSpeed);
    if (this.dccService.isConnected()) {
      try {
        await this.dccService.setLocoSpeed(
          this.dccService.locoAddress(),
          clampedSpeed,
          this.dccService.locoDirection()
        );
      } catch (error) {
        console.error('Failed to set speed:', error);
      }
    }
  }

  adjustSpeedBy(delta: number): void {
    this.setLocoSpeed(this.dccService.locoSpeed() + delta);
  }

  brake(): Promise<void> {
    return this.setLocoSpeed(0);
  }

  async setDirection(forward: boolean): Promise<void> {
    if (this.dccService.isConnected()) {
      await this.dccService.setLocoDirection(forward);
    }
  }

  toggleDirection(): Promise<void> {
    return this.setDirection(!this.dccService.locoDirection());
  }

  toggleDirectionDisplay(): void {
    this.dccService.setInvertDisplay(!this.dccService.invertDirectionDisplay());
  }

  onDebugCommandChange(event: Event): void {
    this.debugCommand.set((event.target as HTMLInputElement).value);
  }

  onSpeedInputChange(event: Event): void {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(value)) {
      this.setLocoSpeed(value);
    }
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
