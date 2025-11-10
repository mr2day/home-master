import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HButtonComponent } from '@home-master/ui';

@Component({
  selector: 'app-home',
  imports: [RouterLink, HButtonComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss'
})
export class HomeComponent {
}
