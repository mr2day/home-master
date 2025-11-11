import { Component, ViewChild, ElementRef, AfterViewInit, OnDestroy, signal } from '@angular/core';
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
  isRecording = signal(false);
  recordingTime = signal('00:00');
  focusValue = signal(250);
  shutterSpeedValue = signal(600);
  brightnessValue = signal(50);
  contrastValue = signal(50);
  exposureCompensationValue = signal(40);
  private mediaStream: MediaStream | null = null;
  private videoTrack: MediaStreamTrack | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private recordingStartTime: number = 0;
  private recordingTimer: number | null = null;

  ngAfterViewInit(): void {
    this.startWebcam();
  }

  private async startWebcam(): Promise<void> {
    try {
      const tryExact = { width: { exact: 2560 }, height: { exact: 1440 }, frameRate: { ideal: 30 } };
      const tryIdeal = { width: { ideal: 2560 }, height: { ideal: 1440 }, frameRate: { ideal: 30 } };

      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: tryExact, audio: false });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: tryIdeal, audio: false });
      }
      this.videoTrack = stream.getVideoTracks()[0];
      console.log(this.videoTrack.getCapabilities());

      try {
        await this.videoTrack.applyConstraints({
          advanced: [{ focusMode: 'manual' } as any]
        });
      } catch (error) {
        console.warn('Manual focus mode not supported:', error);
      }

      try {
        await this.videoTrack.applyConstraints({
          advanced: [{ exposureMode: 'manual' } as any]
        });
      } catch (error) {
        console.warn('Manual exposure mode not supported:', error);
      }

      try {
        await this.videoTrack.applyConstraints({
          advanced: [{ exposureTime: this.shutterSpeedValue() } as any]
        });
      } catch (error) {
        console.warn('Manual exposure time not supported:', error);
      }

      try {
        await this.videoTrack.applyConstraints({
          advanced: [{ brightness: this.brightnessValue(), contrast: this.contrastValue(), exposureCompensation: this.exposureCompensationValue() } as any]
        });
      } catch (error) {
        console.warn('Manual brightness/contrast/exposure compensation not supported:', error);
      }

      this.mediaStream = stream;
      this.videoElement.nativeElement.srcObject = this.mediaStream;

      this.initializeRecorder();
    } catch (error) {
      this.errorMessage = 'Unable to access webcam. Please check permissions.';
      console.error('Webcam error:', error);
    }
  }

  private initializeRecorder(): void {
    if (!this.mediaStream) return;
    try {
      const options = { mimeType: 'video/webm;codecs=vp9' };
      this.mediaRecorder = new MediaRecorder(this.mediaStream, options);
      this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
        this.recordedChunks.push(event.data);
      };
      this.mediaRecorder.onstop = () => {
        this.handleRecordingStop();
      };
    } catch (error) {
      console.warn('MediaRecorder initialization failed:', error);
    }
  }

  private handleRecordingStop(): void {
    const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `webcam-${Date.now()}.webm`;
    a.click();
    URL.revokeObjectURL(url);
    this.recordedChunks = [];
  }

  toggleRecording(): void {
    if (!this.mediaRecorder) return;

    if (this.isRecording()) {
      this.stopRecording();
    } else {
      this.startRecording();
    }
  }

  private startRecording(): void {
    if (!this.mediaRecorder) return;
    this.recordedChunks = [];
    this.mediaRecorder.start();
    this.isRecording.set(true);
    this.recordingStartTime = Date.now();
    this.startRecordingTimer();
  }

  private stopRecording(): void {
    if (!this.mediaRecorder) return;
    this.mediaRecorder.stop();
    this.isRecording.set(false);
    if (this.recordingTimer !== null) {
      clearInterval(this.recordingTimer);
      this.recordingTimer = null;
    }
  }

  private startRecordingTimer(): void {
    this.recordingTimer = window.setInterval(() => {
      const elapsed = Date.now() - this.recordingStartTime;
      const seconds = Math.floor(elapsed / 1000);
      const minutes = Math.floor(seconds / 60);
      const secs = seconds % 60;
      this.recordingTime.set(
        `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
      );
    }, 100);
  }

  async applyFocusDistance(distance: number): Promise<void> {
    if (!this.videoTrack) return;
    const clampedDistance = Math.max(0, Math.min(1023, distance));
    this.focusValue.set(clampedDistance);
    try {
      await this.videoTrack.applyConstraints({
        advanced: [{ focusDistance: clampedDistance } as any]
      });
    } catch (error) {
      console.error('Failed to set focus distance:', error);
    }
  }

  onFocusInputChange(event: Event): void {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(value)) {
      this.applyFocusDistance(value);
    }
  }

  adjustFocusBy(delta: number): void {
    this.applyFocusDistance(this.focusValue() + delta);
  }

  async applyShutterSpeed(speed: number): Promise<void> {
    if (!this.videoTrack) return;
    const clampedSpeed = Math.max(1.220703125, Math.min(10000, speed));
    this.shutterSpeedValue.set(clampedSpeed);
    try {
      await this.videoTrack.applyConstraints({
        advanced: [{ exposureTime: clampedSpeed } as any]
      });
    } catch (error) {
      console.error('Failed to set shutter speed:', error);
    }
  }

  onShutterSpeedInputChange(event: Event): void {
    const value = parseFloat((event.target as HTMLInputElement).value);
    if (!isNaN(value)) {
      this.applyShutterSpeed(value);
    }
  }

  async adjustShutterSpeedBy(delta: number): Promise<void> {
    await this.applyShutterSpeed(this.shutterSpeedValue() + delta * 50);
  }

  async applyBrightness(brightness: number): Promise<void> {
    if (!this.videoTrack) return;
    const clampedBrightness = Math.max(-64, Math.min(64, brightness));
    this.brightnessValue.set(clampedBrightness);
    try {
      await this.videoTrack.applyConstraints({
        advanced: [{ brightness: clampedBrightness } as any]
      });
    } catch (error) {
      console.error('Failed to set brightness:', error);
    }
  }

  onBrightnessInputChange(event: Event): void {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(value)) {
      this.applyBrightness(value);
    }
  }

  async adjustBrightnessBy(delta: number): Promise<void> {
    await this.applyBrightness(this.brightnessValue() + delta);
  }

  async applyContrast(contrast: number): Promise<void> {
    if (!this.videoTrack) return;
    const clampedContrast = Math.max(0, Math.min(100, contrast));
    this.contrastValue.set(clampedContrast);
    try {
      await this.videoTrack.applyConstraints({
        advanced: [{ contrast: clampedContrast } as any]
      });
    } catch (error) {
      console.error('Failed to set contrast:', error);
    }
  }

  onContrastInputChange(event: Event): void {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(value)) {
      this.applyContrast(value);
    }
  }

  async adjustContrastBy(delta: number): Promise<void> {
    await this.applyContrast(this.contrastValue() + delta);
  }

  async applyExposureCompensation(compensation: number): Promise<void> {
    if (!this.videoTrack) return;
    const clampedCompensation = Math.max(0, Math.min(128, compensation));
    this.exposureCompensationValue.set(clampedCompensation);
    try {
      await this.videoTrack.applyConstraints({
        advanced: [{ exposureCompensation: clampedCompensation } as any]
      });
    } catch (error) {
      console.error('Failed to set exposure compensation:', error);
    }
  }

  onExposureCompensationInputChange(event: Event): void {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(value)) {
      this.applyExposureCompensation(value);
    }
  }

  async adjustExposureCompensationBy(delta: number): Promise<void> {
    await this.applyExposureCompensation(this.exposureCompensationValue() + delta);
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
    if (this.recordingTimer !== null) {
      clearInterval(this.recordingTimer);
    }
    if (this.isRecording()) {
      this.stopRecording();
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
    }
  }
}
