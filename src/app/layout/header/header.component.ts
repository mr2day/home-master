import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DccService } from '../../services/dcc';
import { DccControlBarComponent } from '../dcc-control-bar/dcc-control-bar.component';

@Component({
  selector: 'app-header',
  imports: [RouterLink, DccControlBarComponent],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss'
})
export class HeaderComponent {
  dccService = inject(DccService);
}
