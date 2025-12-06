import { Component, ViewChild, ElementRef, AfterViewInit, OnDestroy, signal, computed, inject } from '@angular/core';
import { HButtonComponent } from '@home-master/ui';
import { DccService } from '../../services/dcc';

@Component({
  selector: 'app-webcam-snip',
  imports: [HButtonComponent],
  templateUrl: './webcam-snip.component.html',
  styleUrl: './webcam-snip.component.scss'
})
export class WebcamSnipComponent implements AfterViewInit, OnDestroy {
  @ViewChild('videoElement') videoElement!: ElementRef<HTMLVideoElement>;
  dccService = inject(DccService);
  errorMessage: string = '';
  isRecording = signal(false);
  recordingTime = signal('00:00');
  availableResolutions = signal<{ width: number; height: number }[]>([]);
  focusValue = signal(250);
  shutterSpeedValue = signal(600);
  private exposureStops: number[] = [50, 100, 200, 350, 650, 1300, 2550, 5050];
  private exposureStopIndex = signal(0);
  shutterLabel = computed(() => this.formatShutterLabel(this.shutterSpeedValue()));
  resolutionValue = signal('');
  private mediaStream: MediaStream | null = null;
  private videoTrack: MediaStreamTrack | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private recordingStartTime: number = 0;
  private recordingTimer: number | null = null;
  private supportedResolutions = [
    { width: 2592, height: 1944 },
    { width: 2560, height: 1440 },
    { width: 1920, height: 1080 },
    { width: 1280, height: 720 },
    { width: 640, height: 480 }
  ];

  // Action used by h-button to toggle recording with loader/result UI
  toggleRecordingAction = async (): Promise<void> => {
    this.toggleRecording();
  };
  snipAction = async (): Promise<void> => {
    await this.snip();
  };

  // DCC actions
  toggleDccConnectionAction = async (): Promise<void> => {
    if (this.dccService.isConnected()) {
      await this.dccService.disconnect();
    } else {
      await this.dccService.connect();
    }
  };

  testDccAction = async (): Promise<void> => {
    await this.dccService.getStatus();
  };

  ngAfterViewInit(): void {
    this.startWebcam();
  }

  private formatResolution(res: { width: number; height: number }): string {
    return `${res.width}x${res.height}`;
  }

  private async probeAvailableResolutions(): Promise<{ width: number; height: number }[]> {
    const available: { width: number; height: number }[] = [];
    for (const res of this.supportedResolutions) {
      try {
        const testStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { exact: res.width }, height: { exact: res.height } },
          audio: false
        });
        // If successful, immediately stop and record availability
        testStream.getTracks().forEach(t => t.stop());
        available.push(res);
        console.log(`Resolution supported: ${this.formatResolution(res)}`);
      } catch {
        console.log(`Resolution ${res.width}x${res.height} not supported`);
      }
    }
    return available;
  }

  private pickDefaultResolution(available: { width: number; height: number }[]): { width: number; height: number } | null {
    if (available.length === 0) return null;
    const preferred = available.find(r => r.width === 1280 && r.height === 720);
    if (preferred) return preferred;
    // Find next smaller than 1280x720, based on supportedResolutions (already sorted high -> low)
    for (const candidate of this.supportedResolutions) {
      if (candidate.width <= 1280 && candidate.height <= 720) {
        const found = available.find(r => r.width === candidate.width && r.height === candidate.height);
        if (found) return found;
      }
    }
    // Fallback to first available (highest)
    return available[0];
  }

  private async startWebcam(): Promise<void> {
    try {
      // Probe all supported resolutions
      const available = await this.probeAvailableResolutions();

      // Pick default resolution: prefer 1280x720, else next smaller, else first available
      const chosen = this.pickDefaultResolution(available);
      if (!chosen) {
        throw new Error('No supported resolution found');
      }
      const initialResolution = this.formatResolution(chosen);
      // Set the selected value BEFORE populating options/rendering to avoid initial max selection
      this.resolutionValue.set(initialResolution);
      // Now publish available options for the select
      this.availableResolutions.set(available);

      // Open the actual stream at the chosen resolution
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { exact: chosen.width }, height: { exact: chosen.height }, frameRate: { ideal: 30 } },
        audio: false
      });
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
        // Snap to nearest stop and apply
        const nearest = this.getNearestExposureStop(this.shutterSpeedValue());
        this.setExposureStopByValue(nearest);
        await this.videoTrack.applyConstraints({
          advanced: [{ exposureTime: nearest } as any]
        });
      } catch (error) {
        console.warn('Manual exposure time not supported:', error);
      }

      this.mediaStream = stream;
      this.videoElement.nativeElement.srcObject = this.mediaStream;

      this.initializeRecorder();

      // Ensure initial defaults are applied to the device after stream is ready
      await this.reassertManualFocusAndExposure();
    } catch (error) {
      this.errorMessage = 'Unable to access webcam. Please check permissions.';
      console.error('Webcam error:', error);
    }
  }

  private async reassertManualFocusAndExposure(): Promise<void> {
    if (!this.videoTrack) return;
    try {
      await this.videoTrack.applyConstraints({
        advanced: [{ focusMode: 'manual' } as any]
      });
    } catch (e) {
      console.warn('Reassert focus manual mode failed:', e);
    }
    try {
      await this.videoTrack.applyConstraints({
        advanced: [{ exposureMode: 'manual' } as any]
      });
    } catch (e) {
      console.warn('Reassert exposure manual mode failed:', e);
    }
    try {
      await this.videoTrack.applyConstraints({
        advanced: [{ focusDistance: this.focusValue() } as any]
      });
    } catch (e) {
      console.warn('Reapply focus distance failed:', e);
    }
    try {
      await this.videoTrack.applyConstraints({
        advanced: [{ exposureTime: this.shutterSpeedValue() } as any]
      });
    } catch (e) {
      console.warn('Reapply exposure time failed:', e);
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
        advanced: [{ focusMode: 'manual', focusDistance: clampedDistance } as any]
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
    const clampedSpeed = Math.max(1, Math.min(10000, speed));
    this.shutterSpeedValue.set(clampedSpeed);
    try {
      await this.videoTrack.applyConstraints({
        advanced: [{ exposureMode: 'manual', exposureTime: clampedSpeed } as any]
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
    // Move to the next/previous stop
    const nextIndex = this.exposureStopIndex() + delta;
    const clamped = Math.max(0, Math.min(this.exposureStops.length - 1, nextIndex));
    if (clamped === this.exposureStopIndex()) return;
    this.setExposureStopByIndex(clamped);
    await this.applyShutterSpeed(this.shutterSpeedValue());
  }

  private formatShutterLabel(us: number): string {
    // Convert microseconds to a classic shutter fraction label like 1/200 s
    const denomCandidates = [
      20000, 10000, 8000, 6400, 5000, 4000, 3200, 2500, 2000, 1600, 1250, 1000,
      800, 640, 500, 400, 320, 250, 200
    ];
    const denomApprox = Math.max(1, Math.round(1_000_000 / Math.max(1, us)));
    let best = denomCandidates[0];
    let bestDiff = Math.abs(best - denomApprox);
    for (const d of denomCandidates) {
      const diff = Math.abs(d - denomApprox);
      if (diff < bestDiff) {
        best = d;
        bestDiff = diff;
      }
    }
    return `1/${best}`;
  }

  private getNearestExposureStop(value: number): number {
    let nearest = this.exposureStops[0];
    let minDiff = Math.abs(value - nearest);
    for (const s of this.exposureStops) {
      const d = Math.abs(value - s);
      if (d < minDiff) {
        nearest = s;
        minDiff = d;
      }
    }
    return nearest;
  }

  private setExposureStopByValue(value: number): void {
    const idx = this.exposureStops.findIndex((v) => v === value);
    this.exposureStopIndex.set(idx >= 0 ? idx : 0);
    this.shutterSpeedValue.set(value);
  }

  private setExposureStopByIndex(index: number): void {
    const clamped = Math.max(0, Math.min(this.exposureStops.length - 1, index));
    this.exposureStopIndex.set(clamped);
    this.shutterSpeedValue.set(this.exposureStops[clamped]);
  }

  async applyResolution(resolutionStr: string): Promise<void> {
    if (!this.videoTrack) return;
    const resolution = this.supportedResolutions.find(
      r => `${r.width}x${r.height}` === resolutionStr
    );
    if (!resolution) {
      this.errorMessage = `Invalid resolution: ${resolutionStr}`;
      return;
    }

    try {
      await this.videoTrack.applyConstraints({
        width: { exact: resolution.width },
        height: { exact: resolution.height },
        frameRate: { ideal: 30 }
      });
      this.resolutionValue.set(resolutionStr);
      console.log(`Resolution changed to ${resolutionStr}`);
      // Reassert manual modes and current values after changing resolution.
      await this.reassertManualFocusAndExposure();
    } catch (error) {
      this.errorMessage = `Failed to apply resolution ${resolutionStr}`;
      console.error('Failed to set resolution:', error);
    }
  }

  onResolutionInputChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.applyResolution(value);
  }

  async snip(): Promise<void> {
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
