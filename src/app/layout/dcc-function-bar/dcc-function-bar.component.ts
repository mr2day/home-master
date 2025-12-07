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

  isActive(fn: number): boolean {
    return this.dccService.activeFunctions().has(fn);
  }

  async toggleFunction(fn: number): Promise<void> {
    const addr = this.dccService.locoAddress();
    const currentSet = new Set(this.dccService.activeFunctions());
    const isOn = currentSet.has(fn);

    if (!this.dccService.isConnected()) return;

    const nextOn = !isOn;
    try {
      await this.dccService.sendCommand(`<F ${addr} ${fn} ${nextOn ? 1 : 0}>`);
      if (nextOn) {
        currentSet.add(fn);
      } else {
        currentSet.delete(fn);
      }
      this.dccService.updateFunctions(currentSet);
    } catch (error) {
      console.error(`Failed to toggle function ${fn}:`, error);
    }
  }
}
