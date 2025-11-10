import { Component, ViewChild, ElementRef, AfterViewInit, OnDestroy } from '@angular/core';
import { HButtonComponent } from '@home-master/ui';

@Component({
  selector: 'app-webcam-snip',
  imports: [HButtonComponent],
  templateUrl: './webcam-snip.component.html',
  styleUrl: './webcam-snip.component.scss'
})
export class WebcamSnipComponent implements AfterViewInit, OnDestroy {
  @ViewChild('videoElement') videoElement!: ElementRef<HTMLVideoElement>;
  errorMessage: string = '';
  private mediaStream: MediaStream | null = null;

  ngAfterViewInit(): void {
    this.startWebcam();
  }

  private async startWebcam(): Promise<void> {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false
      });
      this.videoElement.nativeElement.srcObject = this.mediaStream;
    } catch (error) {
      this.errorMessage = 'Unable to access webcam. Please check permissions.';
      console.error('Webcam error:', error);
    }
  }

  async snip(actionPromise: Promise<void>): Promise<void> {
    try {
      const video = this.videoElement.nativeElement;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        this.errorMessage = 'Unable to capture image.';
        throw new Error('Unable to capture image.');
      }
      ctx.drawImage(video, 0, 0);

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve);
      });

      if (!blob) {
        this.errorMessage = 'Unable to create image blob.';
        throw new Error('Unable to create image blob.');
      }

      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
      this.errorMessage = '';
      await actionPromise;
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Unable to copy to clipboard.';
      console.error('Snip error:', error);
      throw error;
    }
  }

  ngOnDestroy(): void {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
    }
  }
}
