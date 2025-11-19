import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { WebcamSnipComponent } from './pages/webcam-snip/webcam-snip.component';
import { MultiCamerasComponent } from './pages/multi-cameras/multi-cameras.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'webcam-snip', component: WebcamSnipComponent },
  { path: 'multi-cameras', component: MultiCamerasComponent },
];
