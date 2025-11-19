import { Component, ViewChild, ElementRef, AfterViewInit, OnDestroy, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HButtonComponent } from '@home-master/ui';

@Component({
  selector: 'app-multi-cameras',
  imports: [HButtonComponent, CommonModule],
  templateUrl: './multi-cameras.component.html',
  styleUrl: './multi-cameras.component.scss',
})
export class MultiCamerasComponent implements AfterViewInit, OnDestroy {
  @ViewChild('videoContainer', { read: ElementRef }) videoContainer?: ElementRef<HTMLDivElement>;

  errorMessage: string = '';
  isRecording = signal(false);
  recordingTime = signal('00:00');

  availableCameras = signal<MediaDeviceInfo[]>([]);
  selectedCameraIndex = signal<number>(0);
  viewMode = signal<'single' | 'grid'>('single');

  private mediaStreams: Map<string, MediaStream> = new Map();
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private recordingStartTime: number = 0;
  private recordingTimer: number | null = null;

  constructor() {
    // Update display when selected camera changes
    effect(() => {
      this.selectedCameraIndex();
      setTimeout(() => this.updateDisplay(), 0);
    });

    // Update display when view mode changes
    effect(() => {
      this.viewMode();
      setTimeout(() => this.updateDisplay(), 0);
    });
  }

  toggleRecordingAction = async (): Promise<void> => {
    this.toggleRecording();
  };

  snipAction = async (): Promise<void> => {
    await this.snip();
  };

  ngAfterViewInit(): void {
    this.initializeCameras();
  }

  private async initializeCameras(): Promise<void> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter(device => device.kind === 'videoinput');

      if (cameras.length === 0) {
        this.errorMessage = 'No cameras found on this device.';
        return;
      }

      this.availableCameras.set(cameras);
      this.selectedCameraIndex.set(0);

      // Start all camera streams
      await Promise.all(
        cameras.map((camera, index) => this.startCameraStream(index))
      );

      this.updateDisplay();
    } catch (error) {
      this.errorMessage = 'Unable to enumerate cameras.';
      console.error('Camera enumeration error:', error);
    }
  }

  private async startCameraStream(index: number): Promise<void> {
    try {
      const camera = this.availableCameras()[index];
      if (!camera) return;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: camera.deviceId }, frameRate: { ideal: 30 } },
        audio: false,
      });

      this.mediaStreams.set(camera.deviceId, stream);
    } catch (error) {
      console.warn(`Unable to start camera ${index}:`, error);
    }
  }

  private updateDisplay(): void {
    if (!this.videoContainer) return;

    const container = this.videoContainer.nativeElement;
    const mode = this.viewMode();

    // Clear existing video elements
    container.innerHTML = '';

    if (mode === 'single') {
      // Single view: show selected camera
      const selectedIndex = this.selectedCameraIndex();
      const selectedCamera = this.availableCameras()[selectedIndex];

      if (selectedCamera) {
        const stream = this.mediaStreams.get(selectedCamera.deviceId);
        if (stream) {
          const video = document.createElement('video');
          video.srcObject = stream;
          video.autoplay = true;
          video.playsInline = true;
          video.className = 'camera-video';
          container.appendChild(video);
        }
      }
    } else {
      // Grid view: show all cameras
      const cameras = this.availableCameras();
      cameras.forEach((camera) => {
        const stream = this.mediaStreams.get(camera.deviceId);
        if (stream) {
          const video = document.createElement('video');
          video.srcObject = stream;
          video.autoplay = true;
          video.playsInline = true;
          video.className = 'camera-video';
          container.appendChild(video);
        }
      });
    }

    // Initialize recorder for single view
    if (mode === 'single' && this.availableCameras().length > 0) {
      const selectedCamera = this.availableCameras()[this.selectedCameraIndex()];
      const stream = this.mediaStreams.get(selectedCamera.deviceId);
      if (stream) {
        this.initializeRecorder(stream);
      }
    }
  }

  private initializeRecorder(stream: MediaStream): void {
    try {
      const options = { mimeType: 'video/webm;codecs=vp9' };
      this.mediaRecorder = new MediaRecorder(stream, options);
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
    a.download = `cameras-${Date.now()}.webm`;
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

  selectCamera(index: number): void {
    this.selectedCameraIndex.set(index);
  }

  toggleViewMode(): void {
    const newMode = this.viewMode() === 'single' ? 'grid' : 'single';
    this.viewMode.set(newMode);
  }

  async snip(): Promise<void> {
    try {
      const videoElement = this.videoContainer?.nativeElement.querySelector('video');
      if (!videoElement) {
        this.errorMessage = 'No video available to capture.';
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        this.errorMessage = 'Unable to capture image.';
        return;
      }

      ctx.drawImage(videoElement, 0, 0);

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve);
      });

      if (!blob) {
        this.errorMessage = 'Unable to create image blob.';
        return;
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
    // Stop all camera streams
    this.mediaStreams.forEach((stream) => {
      stream.getTracks().forEach((track) => track.stop());
    });
    this.mediaStreams.clear();
  }
}
