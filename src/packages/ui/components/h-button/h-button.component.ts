import { Component, Input, computed, signal, Output, EventEmitter } from '@angular/core';
import { NgClass } from '@angular/common';

@Component({
  selector: 'h-button',
  imports: [NgClass],
  templateUrl: './h-button.component.html',
  styleUrl: './h-button.component.scss'
})
export class HButtonComponent {
  @Input() label: string = '';
  @Input() size: 'xs' | 'sm' | 'md' | 'lg' = 'lg';
  @Input() ratio: 'square' | 'rectangle' = 'rectangle';
  @Output() asyncAction = new EventEmitter<Promise<void>>();

  labelWords = computed(() => {
    if (this.ratio === 'square') {
      return this.label.split(/\s+/);
    }
    return [this.label];
  });

  isLoading = signal(false);
  resultState = signal<'success' | 'error' | null>(null);

  async handleClick(): Promise<void> {
    if (this.isLoading()) return;

    const startTime = Date.now();
    this.isLoading.set(true);
    this.resultState.set(null);

    try {
      const promise = new Promise<void>((resolve) => {
        this.asyncAction.emit(new Promise<void>((res) => {
          setTimeout(() => {
            const elapsed = Date.now() - startTime;
            const minTime = Math.max(0, 300 - elapsed);
            setTimeout(() => {
              res();
              resolve();
            }, minTime);
          }, 0);
        }));
      });

      await promise;
      this.isLoading.set(false);
      this.resultState.set('success');
      setTimeout(() => {
        this.resultState.set(null);
      }, 2000);
    } catch (error) {
      this.isLoading.set(false);
      this.resultState.set('error');
      setTimeout(() => {
        this.resultState.set(null);
      }, 2000);
    }
  }
}
