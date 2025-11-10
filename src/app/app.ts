import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HHeaderComponent } from '@home-master/ui';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, HHeaderComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
}
