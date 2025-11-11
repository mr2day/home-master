import { Component, Input, computed, signal } from '@angular/core';
import { Router } from '@angular/router';
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
  @Input() action?: () => Promise<void>;
  @Input() routerLink?: string | any[];

  labelWords = computed(() => {
    if (this.ratio === 'square') {
      return this.label.split(/\s+/);
    }
    return [this.label];
  });

  isLoading = signal(false);
  resultState = signal<'success' | 'error' | null>(null);

  constructor(private router: Router) {}

  async handleClick(): Promise<void> {
    if (this.isLoading()) return;

    const startTime = Date.now();
    this.isLoading.set(true);
    this.resultState.set(null);

    try {
      if (this.action) {
        await this.action();
      }

      const elapsed = Date.now() - startTime;
      const minTime = Math.max(0, 300 - elapsed);
      if (minTime > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, minTime));
      }

      this.isLoading.set(false);
      this.resultState.set('success');
      if (this.routerLink) {
        if (typeof this.routerLink === 'string') {
          await this.router.navigateByUrl(this.routerLink);
        } else if (Array.isArray(this.routerLink)) {
          await this.router.navigate(this.routerLink as any[]);
        }
      }
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
