import { Component, Input } from '@angular/core';

@Component({
  selector: 'h-button',
  imports: [],
  templateUrl: './h-button.component.html',
  styleUrl: './h-button.component.scss'
})
export class HButtonComponent {
  @Input() label: string = '';
}
