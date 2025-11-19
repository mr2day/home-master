import { Component, ViewChild, ElementRef, AfterViewInit, OnDestroy, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HButtonComponent } from '@home-master/ui';

@Component({
  selector: 'app-webcam-snip',
  imports: [HButtonComponent, CommonModule],
  templateUrl: './webcam-snip.component.html',
  styleUrl: './webcam-snip.component.scss'
})
export class WebcamSnipComponent implements AfterViewInit, OnDestroy {
  @ViewChild('videoElement', { read: ElementRef }) videoElement!: ElementRef<HTMLVideoElement>;
  @ViewChild('videoElement2', { read: ElementRef, static: false }) videoElement2?: ElementRef<HTMLVideoElement>;
  errorMessage: string = '';
  isRecording = signal(false);
  recordingTime = signal('00:00');
  availableResolutions = signal<{ width: number; height: number }[]>([]);
  focusValue = signal(250);
  shutterSpeedValue = signal(600);
  private exposureStops: number[] = [50, 100, 200, 350, 650, 1300, 2550, 5050];
  private exposureStopIndex = signal(0);
  shutterLabel = computed(() => this.formatShutterLabel(this.shutterSpeedValue()));
  brightnessValue = signal(50);
  contrastValue = signal(50);
  exposureCompensationValue = signal(40);
  resolutionValue = signal('');
  availableCameras = signal<MediaDeviceInfo[]>([]);
  selectedCameraId = signal<string>('');
  selectedCamera2Id = signal<string>('');
  cameraMode = signal<'single' | 'split'>('single');
  private mediaStream: MediaStream | null = null;
  private mediaStream2: MediaStream | null = null;
  private videoTrack: MediaStreamTrack | null = null;
  private videoTrack2: MediaStreamTrack | null = null;
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

  constructor() {
    // Set up effect to update displayed stream when selected camera changes
    effect(() => {
      // Read the signal to establish dependency
      this.selectedCameraId();
      // Update the display in the next tick to ensure view is ready
      setTimeout(() => this.updateDisplayedStream(), 0);
    });

    // Set up effect to update display when camera mode changes
    effect(() => {
      this.cameraMode();
      setTimeout(() => this.updateDisplayedStream(), 0);
    });
  }

  // Action used by h-button to toggle recording with loader/result UI
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
      this.selectedCameraId.set(cameras[0].deviceId);
      // Set camera 2 to the second camera if available, otherwise leave empty
      if (cameras.length > 1) {
        this.selectedCamera2Id.set(cameras[1].deviceId);
        // Start both cameras continuously
        await Promise.all([
          this.startPrimaryCameraStream(),
          this.startSecondaryCameraStream()
        ]);
      } else {
        this.selectedCamera2Id.set('');
        await this.startPrimaryCameraStream();
      }
    } catch (error) {
      this.errorMessage = 'Unable to enumerate cameras.';
      console.error('Camera enumeration error:', error);
    }
  }

  private async startPrimaryCameraStream(): Promise<void> {
    try {
      // Probe all supported resolutions for the selected camera
      const available = await this.probeAvailableResolutions(this.selectedCameraId());

      // Pick default resolution: prefer 1280x720, else next smaller, else first available
      let chosen = this.pickDefaultResolution(available);

      // Fallback: if no specific resolution works, try without exact constraints
      if (!chosen) {
        console.warn('No exact resolutions supported, attempting flexible resolution');
        chosen = { width: 1280, height: 720 };
        this.availableResolutions.set([]);
      } else {
        const initialResolution = this.formatResolution(chosen);
        this.resolutionValue.set(initialResolution);
        this.availableResolutions.set(available);
      }

      // Open the actual stream for the primary camera
      let stream: MediaStream;
      if (available.length > 0) {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: this.selectedCameraId() }, width: { exact: chosen.width }, height: { exact: chosen.height }, frameRate: { ideal: 30 } },
          audio: false
        });
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: this.selectedCameraId() }, width: { ideal: chosen.width }, height: { ideal: chosen.height }, frameRate: { ideal: 30 } },
          audio: false
        });
      }

      this.videoTrack = stream.getVideoTracks()[0];
      await this.applyVideoConstraints(this.videoTrack, this.selectedCameraId());

      this.mediaStream = stream;
      // Don't bind directly; let updateDisplayedStream handle it based on mode
      this.updateDisplayedStream();

      this.initializeRecorder();

      // Ensure initial defaults are applied to the device after stream is ready
      await this.reassertManualFocusAndExposure();
    } catch (error) {
      this.errorMessage = 'Unable to access primary camera. Please check permissions.';
      console.error('Primary camera error:', error);
    }
  }

  private async startSecondaryCameraStream(): Promise<void> {
    try {
      // Use lower resolution for secondary camera to reduce resource usage
      const resolution = { width: 640, height: 480 };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: this.selectedCamera2Id() }, width: { exact: resolution.width }, height: { exact: resolution.height }, frameRate: { ideal: 30 } },
          audio: false
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: this.selectedCamera2Id() }, width: { ideal: resolution.width }, height: { ideal: resolution.height }, frameRate: { ideal: 30 } },
          audio: false
        });
      }

      this.videoTrack2 = stream.getVideoTracks()[0];
      await this.applyVideoConstraints(this.videoTrack2, this.selectedCamera2Id());

      this.mediaStream2 = stream;
      // Don't bind directly; let updateDisplayedStream handle it based on mode
      this.updateDisplayedStream();
    } catch (error) {
      console.warn('Unable to start secondary camera stream:', error);
    }
  }

  private formatResolution(res: { width: number; height: number }): string {
    return `${res.width}x${res.height}`;
  }

  private async probeAvailableResolutions(deviceId?: string): Promise<{ width: number; height: number }[]> {
    const available: { width: number; height: number }[] = [];
    for (const res of this.supportedResolutions) {
      try {
        const videoConstraint: any = {
          width: { exact: res.width },
          height: { exact: res.height },
          frameRate: { ideal: 30 }
        };
        if (deviceId) {
          videoConstraint.deviceId = { exact: deviceId };
        }
        const testStream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraint,
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

  private isTrustCamera(deviceId: string): boolean {
    const camera = this.availableCameras().find(c => c.deviceId === deviceId);
    if (!camera) {
      return false;
    }
    // Check if the camera label contains "Trust"
    return camera.label.toLowerCase().includes('trust');
  }

  // Update the displayed stream based on selected camera and mode
  private updateDisplayedStream(): void {
    const mode = this.cameraMode();

    // In split mode, both video elements should be bound to their respective streams
    if (mode === 'split') {
      if (this.videoElement?.nativeElement) {
        // Left side shows primary camera (camera 1)
        this.videoElement.nativeElement.srcObject = this.mediaStream;
      }
      if (this.videoElement2?.nativeElement) {
        // Right side shows secondary camera (camera 2)
        this.videoElement2.nativeElement.srcObject = this.mediaStream2;
      }
    } else {
      // In single mode, show the selected camera
      if (!this.videoElement?.nativeElement) {
        return;
      }
      const selectedId = this.selectedCameraId();
      const camera2Id = this.availableCameras()[1]?.deviceId;

      // If selected camera is camera 2, show mediaStream2, otherwise show primary stream
      if (selectedId === camera2Id && this.mediaStream2) {
        this.videoElement.nativeElement.srcObject = this.mediaStream2;
      } else {
        this.videoElement.nativeElement.srcObject = this.mediaStream;
      }
    }
  }

  private async applyVideoConstraints(videoTrack: MediaStreamTrack, deviceId?: string): Promise<void> {
    // Check if this is a Trust camera
    const isTrustCamera = deviceId ? this.isTrustCamera(deviceId) : true;

    if (!isTrustCamera) {
      // For non-Trust cameras, try to reset to auto mode, but don't fail if unsupported
      console.log('Setting non-Trust camera to auto mode');
      // Try setting both modes together first
      try {
        await videoTrack.applyConstraints({
          advanced: [{ focusMode: 'auto', exposureMode: 'auto' } as any]
        });
      } catch (e) {
        // If both together fails, try individually
        try {
          await videoTrack.applyConstraints({
            advanced: [{ focusMode: 'auto' } as any]
          });
        } catch (e2) {
          console.log('focusMode auto not supported');
        }
        try {
          await videoTrack.applyConstraints({
            advanced: [{ exposureMode: 'auto' } as any]
          });
        } catch (e3) {
          console.log('exposureMode auto not supported');
        }
      }
      return;
    }

    const capabilities = videoTrack.getCapabilities() as any;
    console.log('Camera capabilities:', capabilities);

    // Check and apply focusMode if supported
    if (capabilities.focusMode && Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes('manual')) {
      try {
        await videoTrack.applyConstraints({
          advanced: [{ focusMode: 'manual' } as any]
        });
      } catch (error) {
        console.warn('Failed to set manual focus mode:', error);
      }
    }

    // Check and apply exposureMode if supported
    if (capabilities.exposureMode && Array.isArray(capabilities.exposureMode) && capabilities.exposureMode.includes('manual')) {
      try {
        await videoTrack.applyConstraints({
          advanced: [{ exposureMode: 'manual' } as any]
        });
      } catch (error) {
        console.warn('Failed to set manual exposure mode:', error);
      }
    }

    // Check and apply exposureTime if supported
    if (capabilities.exposureTime) {
      try {
        const nearest = this.getNearestExposureStop(this.shutterSpeedValue());
        this.setExposureStopByValue(nearest);
        await videoTrack.applyConstraints({
          advanced: [{ exposureTime: nearest } as any]
        });
      } catch (error) {
        console.warn('Failed to set exposure time:', error);
      }
    }

    // Check and apply brightness, contrast, exposureCompensation individually with range clamping
    const advancedConstraints: any = {};

    if (capabilities.brightness) {
      const brightnessValue = this.brightnessValue();
      // Clamp to the supported range
      const min = capabilities.brightness.min !== undefined ? capabilities.brightness.min : 0;
      const max = capabilities.brightness.max !== undefined ? capabilities.brightness.max : 100;
      advancedConstraints.brightness = Math.max(min, Math.min(max, brightnessValue));
      console.log(`Brightness: ${brightnessValue} -> ${advancedConstraints.brightness} (range: ${min}-${max})`);
    }

    if (capabilities.contrast) {
      const contrastValue = this.contrastValue();
      // Clamp to the supported range
      const min = capabilities.contrast.min !== undefined ? capabilities.contrast.min : 0;
      const max = capabilities.contrast.max !== undefined ? capabilities.contrast.max : 100;
      advancedConstraints.contrast = Math.max(min, Math.min(max, contrastValue));
      console.log(`Contrast: ${contrastValue} -> ${advancedConstraints.contrast} (range: ${min}-${max})`);
    }

    if (capabilities.exposureCompensation) {
      const exposureCompensationValue = this.exposureCompensationValue();
      // Clamp to the supported range
      const min = capabilities.exposureCompensation.min !== undefined ? capabilities.exposureCompensation.min : 0;
      const max = capabilities.exposureCompensation.max !== undefined ? capabilities.exposureCompensation.max : 100;
      advancedConstraints.exposureCompensation = Math.max(min, Math.min(max, exposureCompensationValue));
      console.log(`Exposure Compensation: ${exposureCompensationValue} -> ${advancedConstraints.exposureCompensation} (range: ${min}-${max})`);
    }

    // Only apply if there are supported constraints
    if (Object.keys(advancedConstraints).length > 0) {
      try {
        await videoTrack.applyConstraints({
          advanced: [advancedConstraints]
        });
      } catch (error) {
        console.warn('Failed to apply brightness/contrast/exposureCompensation:', error);
      }
    }
  }

  private async startSecondaryCamera(resolution: { width: number; height: number }): Promise<void> {
    try {
      let stream: MediaStream;
      // Try with exact resolution first
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: this.selectedCamera2Id() }, width: { exact: resolution.width }, height: { exact: resolution.height }, frameRate: { ideal: 30 } },
          audio: false
        });
      } catch {
        // Fallback to ideal constraints
        stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: this.selectedCamera2Id() }, width: { ideal: resolution.width }, height: { ideal: resolution.height }, frameRate: { ideal: 30 } },
          audio: false
        });
      }

      this.videoTrack2 = stream.getVideoTracks()[0];
      console.log('Secondary camera stream started:', this.videoTrack2);
      await this.applyVideoConstraints(this.videoTrack2, this.selectedCamera2Id());

      this.mediaStream2 = stream;
      // Don't bind directly; let updateDisplayedStream handle it based on mode
      this.updateDisplayedStream();
    } catch (error) {
      console.warn('Unable to start secondary camera:', error);
    }
  }

  private async reassertManualFocusAndExposure(): Promise<void> {
    if (!this.videoTrack) return;

    // Only apply constraints to Trust cameras
    if (!this.isTrustCamera(this.selectedCameraId())) {
      console.log('Skipping constraint reassertion for non-Trust camera');
      return;
    }

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
    try {
      await this.videoTrack.applyConstraints({
        advanced: [{
          brightness: this.brightnessValue(),
          contrast: this.contrastValue(),
          exposureCompensation: this.exposureCompensationValue()
        } as any]
      });
    } catch (e) {
      console.warn('Reapply brightness/contrast/exposure compensation failed:', e);
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
    if (!this.isTrustCamera(this.selectedCameraId())) {
      return; // Skip constraints for non-Trust cameras
    }
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
    if (!this.isTrustCamera(this.selectedCameraId())) {
      return; // Skip constraints for non-Trust cameras
    }
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

  async applyBrightness(brightness: number): Promise<void> {
    if (!this.videoTrack) return;
    if (!this.isTrustCamera(this.selectedCameraId())) {
      return; // Skip constraints for non-Trust cameras
    }
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
    if (!this.isTrustCamera(this.selectedCameraId())) {
      return; // Skip constraints for non-Trust cameras
    }
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
    if (!this.isTrustCamera(this.selectedCameraId())) {
      return; // Skip constraints for non-Trust cameras
    }
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

  async applyResolution(resolutionStr: string): Promise<void> {
    if (!this.videoTrack) return;
    if (!this.isTrustCamera(this.selectedCameraId())) {
      return; // Skip constraints for non-Trust cameras
    }
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

  async switchToPrimaryCamera(): Promise<void> {
    if (this.cameraMode() === 'split') {
      this.cameraMode.set('single');
      // Stop secondary camera when exiting split mode
      if (this.mediaStream2) {
        this.mediaStream2.getTracks().forEach(track => track.stop());
        this.mediaStream2 = null;
        this.videoTrack2 = null;
        if (this.videoElement2) {
          this.videoElement2.nativeElement.srcObject = null;
        }
      }
    }
    // Just switch to the primary camera without restarting - the stream is already running
    if (this.selectedCameraId() !== this.availableCameras()[0].deviceId) {
      this.selectedCameraId.set(this.availableCameras()[0].deviceId);
    }
  }

  async switchToSecondaryCamera(): Promise<void> {
    if (this.availableCameras().length < 2) {
      return; // No secondary camera available
    }
    if (this.cameraMode() === 'split') {
      this.cameraMode.set('single');
      // Stop secondary camera when exiting split mode
      if (this.mediaStream2) {
        this.mediaStream2.getTracks().forEach(track => track.stop());
        this.mediaStream2 = null;
        this.videoTrack2 = null;
        if (this.videoElement2) {
          this.videoElement2.nativeElement.srcObject = null;
        }
      }
    }
    // Just switch to the secondary camera without restarting - the stream is already running
    if (this.selectedCameraId() !== this.availableCameras()[1].deviceId) {
      this.selectedCameraId.set(this.availableCameras()[1].deviceId);
    }
  }

  async switchPrimaryCamera(deviceId: string): Promise<void> {
    // Just switch which camera is displayed without restarting - the stream is already running
    this.selectedCameraId.set(deviceId);
  }

  async switchSecondaryCamera(deviceId: string): Promise<void> {
    this.selectedCamera2Id.set(deviceId);
    // Stop secondary stream and restart if in split mode
    if (this.mediaStream2) {
      this.mediaStream2.getTracks().forEach(track => track.stop());
      this.mediaStream2 = null;
      this.videoTrack2 = null;
    }
    if (this.cameraMode() === 'split' && deviceId) {
      const resolution = this.availableResolutions()[0] || { width: 1280, height: 720 };
      await this.startSecondaryCamera(resolution);
    }
  }

  async toggleCameraMode(): Promise<void> {
    const newMode = this.cameraMode() === 'single' ? 'split' : 'single';
    this.cameraMode.set(newMode);

    if (newMode === 'split' && this.selectedCamera2Id() && !this.mediaStream2) {
      // Start second camera in split mode with lower resolution to avoid constraints
      // Wait a tick for the template to render the second video element
      await new Promise(resolve => setTimeout(resolve, 0));
      const splitResolution = { width: 640, height: 480 };
      await this.startSecondaryCamera(splitResolution);
      // Both camera streams are now running continuously, just display both
    } else if (newMode === 'single' && this.mediaStream2) {
      // Stop second camera when exiting split mode
      this.mediaStream2.getTracks().forEach(track => track.stop());
      this.mediaStream2 = null;
      this.videoTrack2 = null;
      if (this.videoElement2) {
        this.videoElement2.nativeElement.srcObject = null;
      }
      // Primary camera continues streaming in the background
    }
  }

  onPrimaryCameraChange(event: Event): void {
    const deviceId = (event.target as HTMLSelectElement).value;
    this.switchPrimaryCamera(deviceId);
  }

  onSecondaryCameraChange(event: Event): void {
    const deviceId = (event.target as HTMLSelectElement).value;
    this.switchSecondaryCamera(deviceId);
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
    if (this.mediaStream2) {
      this.mediaStream2.getTracks().forEach(track => track.stop());
    }
  }
}
