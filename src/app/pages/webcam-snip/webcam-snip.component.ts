import { Component, ViewChild, ElementRef, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-webcam-snip',
  imports: [CommonModule],
  templateUrl: './webcam-snip.component.html',
  styleUrl: './webcam-snip.component.scss'
})
export class WebcamSnipComponent implements OnInit, OnDestroy {
  @ViewChild('videoElement') videoElement!: ElementRef<HTMLVideoElement>;
  errorMessage: string = '';

  ngOnInit() {
    this.startWebcam();
  }

  startWebcam() {
    navigator.mediaDevices.getUserMedia({ video: true })
      .then(stream => {
        this.videoElement.nativeElement.srcObject = stream;
      })
      .catch(err => {
        this.errorMessage = 'Unable to access webcam. Please check permissions.';
        console.error('Error accessing webcam:', err);
      });
  }

  stopWebcam() {
    const video = this.videoElement.nativeElement;
    const stream = video.srcObject as MediaStream;
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      video.srcObject = null;
    }
  }

  ngOnDestroy() {
    this.stopWebcam();
  }
}
