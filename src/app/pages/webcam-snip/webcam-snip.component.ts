import { Component, ViewChild, ElementRef, AfterViewInit, OnDestroy, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HButtonComponent } from '@home-master/ui';
import { CameraConstraintsService } from './camera-constraints.service';

@Component({
  selector: 'app-webcam-snip',
  imports: [HButtonComponent, CommonModule],
  templateUrl: './webcam-snip.component.html',
  styleUrl: './webcam-snip.component.scss',
  providers: [CameraConstraintsService]
})
export class WebcamSnipComponent implements AfterViewInit, OnDestroy {
  @ViewChild('videoElement', { read: ElementRef }) videoElement!: ElementRef<HTMLVideoElement>;
  @ViewChild('videoElement2', { read: ElementRef, static: false }) videoElement2?: ElementRef<HTMLVideoElement>;

  // Feature flag: if false, no constraints are applied to cameras
  withConstraints = false;

  errorMessage: string = '';
  isRecording = signal(false);
  recordingTime = signal('00:00');
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

  // Expose constraint service signals for template binding
  get focusValue() { return this.constraintsService.focusValue; }
  get shutterSpeedValue() { return this.constraintsService.shutterSpeedValue; }
  get brightnessValue() { return this.constraintsService.brightnessValue; }
  get contrastValue() { return this.constraintsService.contrastValue; }
  get exposureCompensationValue() { return this.constraintsService.exposureCompensationValue; }
  get resolutionValue() { return this.constraintsService.resolutionValue; }
  get availableResolutions() { return this.constraintsService.availableResolutions; }
  get shutterLabel() { return computed(() => this.constraintsService.formatShutterLabel(this.shutterSpeedValue())); }

  constructor(private constraintsService: CameraConstraintsService) {
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
      this.constraintsService.setAvailableCameras(cameras);
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
      const available = await this.constraintsService.probeAvailableResolutions(this.selectedCameraId());

      // Pick default resolution: prefer 1280x720, else next smaller, else first available
      let chosen = this.constraintsService.pickDefaultResolution(available);

      // Fallback: if no specific resolution works, try without exact constraints
      if (!chosen) {
        console.warn('No exact resolutions supported, attempting flexible resolution');
        chosen = { width: 1280, height: 720 };
        this.constraintsService.availableResolutions.set([]);
      } else {
        const initialResolution = this.constraintsService.formatResolution(chosen);
        this.constraintsService.resolutionValue.set(initialResolution);
        this.constraintsService.availableResolutions.set(available);
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

      // Apply constraints only if withConstraints is enabled
      if (this.withConstraints) {
        await this.constraintsService.applyVideoConstraints(this.videoTrack, this.selectedCameraId());
      }

      this.mediaStream = stream;
      // Don't bind directly; let updateDisplayedStream handle it based on mode
      this.updateDisplayedStream();

      this.initializeRecorder();

      // Ensure initial defaults are applied to the device after stream is ready
      if (this.withConstraints) {
        await this.constraintsService.reassertManualFocusAndExposure(this.videoTrack, this.selectedCameraId());
      }
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

      // Apply constraints only if withConstraints is enabled
      if (this.withConstraints) {
        await this.constraintsService.applyVideoConstraints(this.videoTrack2, this.selectedCamera2Id());
      }

      this.mediaStream2 = stream;
      // Don't bind directly; let updateDisplayedStream handle it based on mode
      this.updateDisplayedStream();
    } catch (error) {
      console.warn('Unable to start secondary camera stream:', error);
    }
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
      const camera1Id = this.availableCameras()[0]?.deviceId;
      const camera2Id = this.availableCameras()[1]?.deviceId;

      // Show the stream corresponding to the selected camera
      if (selectedId === camera2Id) {
        // Camera 2 is selected - MUST use mediaStream2
        this.videoElement.nativeElement.srcObject = this.mediaStream2;
      } else if (selectedId === camera1Id) {
        // Camera 1 is selected - use primary stream
        this.videoElement.nativeElement.srcObject = this.mediaStream;
      }
      // If selectedId doesn't match either camera, don't change the stream
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

      // Apply constraints only if withConstraints is enabled
      if (this.withConstraints) {
        await this.constraintsService.applyVideoConstraints(this.videoTrack2, this.selectedCamera2Id());
      }

      this.mediaStream2 = stream;
      // Don't bind directly; let updateDisplayedStream handle it based on mode
      this.updateDisplayedStream();
    } catch (error) {
      console.warn('Unable to start secondary camera:', error);
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
    if (!this.withConstraints) return;
    await this.constraintsService.applyFocusDistance(distance, this.videoTrack, this.selectedCameraId());
  }

  onFocusInputChange(event: Event): void {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(value)) {
      this.applyFocusDistance(value);
    }
  }

  adjustFocusBy(delta: number): void {
    if (!this.withConstraints) return;
    this.constraintsService.adjustFocusBy(delta, this.videoTrack, this.selectedCameraId());
  }

  async applyShutterSpeed(speed: number): Promise<void> {
    if (!this.withConstraints) return;
    await this.constraintsService.applyShutterSpeed(speed, this.videoTrack, this.selectedCameraId());
  }

  onShutterSpeedInputChange(event: Event): void {
    const value = parseFloat((event.target as HTMLInputElement).value);
    if (!isNaN(value)) {
      this.applyShutterSpeed(value);
    }
  }

  async adjustShutterSpeedBy(delta: number): Promise<void> {
    if (!this.withConstraints) return;
    await this.constraintsService.adjustShutterSpeedBy(delta, this.videoTrack, this.selectedCameraId());
  }

  async applyBrightness(brightness: number): Promise<void> {
    if (!this.withConstraints) return;
    await this.constraintsService.applyBrightness(brightness, this.videoTrack, this.selectedCameraId());
  }

  onBrightnessInputChange(event: Event): void {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(value)) {
      this.applyBrightness(value);
    }
  }

  async adjustBrightnessBy(delta: number): Promise<void> {
    if (!this.withConstraints) return;
    await this.constraintsService.adjustBrightnessBy(delta, this.videoTrack, this.selectedCameraId());
  }

  async applyContrast(contrast: number): Promise<void> {
    if (!this.withConstraints) return;
    await this.constraintsService.applyContrast(contrast, this.videoTrack, this.selectedCameraId());
  }

  onContrastInputChange(event: Event): void {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(value)) {
      this.applyContrast(value);
    }
  }

  async adjustContrastBy(delta: number): Promise<void> {
    if (!this.withConstraints) return;
    await this.constraintsService.adjustContrastBy(delta, this.videoTrack, this.selectedCameraId());
  }

  async applyExposureCompensation(compensation: number): Promise<void> {
    if (!this.withConstraints) return;
    await this.constraintsService.applyExposureCompensation(compensation, this.videoTrack, this.selectedCameraId());
  }

  onExposureCompensationInputChange(event: Event): void {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    if (!isNaN(value)) {
      this.applyExposureCompensation(value);
    }
  }

  async adjustExposureCompensationBy(delta: number): Promise<void> {
    if (!this.withConstraints) return;
    await this.constraintsService.adjustExposureCompensationBy(delta, this.videoTrack, this.selectedCameraId());
  }

  async applyResolution(resolutionStr: string): Promise<void> {
    try {
      await this.constraintsService.applyResolution(resolutionStr, this.videoTrack, this.selectedCameraId());
      console.log(`Resolution changed to ${resolutionStr}`);
      // Reassert manual modes and current values after changing resolution.
      if (this.withConstraints) {
        await this.constraintsService.reassertManualFocusAndExposure(this.videoTrack, this.selectedCameraId());
      }
      this.errorMessage = '';
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
    // If exiting split mode, just change the selected camera and mode
    // DO NOT stop mediaStream2 yet - we might need it later!
    if (this.cameraMode() === 'split') {
      // Set selected camera FIRST
      this.selectedCameraId.set(this.availableCameras()[0].deviceId);
      // THEN exit split mode (triggers effect with correct selectedCameraId)
      this.cameraMode.set('single');
      // Clean up the unused video element binding (but don't stop the stream!)
      if (this.videoElement2) {
        this.videoElement2.nativeElement.srcObject = null;
      }
    } else {
      // Already in single mode, just switch to camera 1
      // Ensure stream is initialized
      if (!this.mediaStream) {
        await this.startPrimaryCameraStream();
      }
      // Now switch the displayed camera
      this.selectedCameraId.set(this.availableCameras()[0].deviceId);
    }
  }

  async switchToSecondaryCamera(): Promise<void> {
    if (this.availableCameras().length < 2) {
      return; // No secondary camera available
    }

    // If exiting split mode, just change the selected camera and mode
    // DO NOT stop mediaStream2 yet - we need it for single view!
    if (this.cameraMode() === 'split') {
      // Set selected camera FIRST
      this.selectedCameraId.set(this.availableCameras()[1].deviceId);
      // THEN exit split mode (triggers effect with correct selectedCameraId)
      this.cameraMode.set('single');
      // Clean up the unused video element binding (but don't stop the stream!)
      if (this.videoElement2) {
        this.videoElement2.nativeElement.srcObject = null;
      }
    } else {
      // Already in single mode, just switch to camera 2
      // Ensure stream is initialized
      if (!this.mediaStream2) {
        await this.startSecondaryCameraStream();
      }
      // Now switch the displayed camera
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
