import { Component, inject } from '@angular/core';
import { DccService } from '../../services/dcc';

@Component({
  selector: 'app-dcc-function-bar',
  imports: [],
  templateUrl: './dcc-function-bar.component.html',
  styleUrl: './dcc-function-bar.component.scss'
})
export class DccFunctionBarComponent {
  dccService = inject(DccService);
  functionNumbers = Array.from({ length: 29 }, (_, i) => i);
  activeFunctions = new Set<number>([0]); // F0 (headlights) is typically on by default

  isActive(fn: number): boolean {
    return this.activeFunctions.has(fn);
  }

  async toggleFunction(fn: number): Promise<void> {
    const addr = this.dccService.locoAddress();
    const isOn = this.activeFunctions.has(fn);

    if (!this.dccService.isConnected()) return;

    const nextOn = !isOn;
    try {
      await this.dccService.sendCommand(`<F ${addr} ${fn} ${nextOn ? 1 : 0}>`);
      if (nextOn) {
        this.activeFunctions.add(fn);
      } else {
        this.activeFunctions.delete(fn);
      }
      this.activeFunctions = new Set(this.activeFunctions);
    } catch (error) {
      console.error(`Failed to toggle function ${fn}:`, error);
    }
  }
}
