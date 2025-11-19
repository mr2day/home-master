import { Injectable, signal } from '@angular/core';

/**
 * Service to manage camera constraints and manual settings.
 * Handles all advanced camera control logic including:
 * - Manual focus, exposure, brightness, contrast adjustments
 * - Shutter speed control with exposure stops
 * - Resolution management
 * - Trust camera detection and constraint application
 */
@Injectable()
export class CameraConstraintsService {
  // Exposure stop values in microseconds
  private exposureStops: number[] = [50, 100, 200, 350, 650, 1300, 2550, 5050];
  private exposureStopIndex = signal(0);

  focusValue = signal(250);
  shutterSpeedValue = signal(600);
  brightnessValue = signal(50);
  contrastValue = signal(50);
  exposureCompensationValue = signal(40);
  resolutionValue = signal('');
  availableResolutions = signal<{ width: number; height: number }[]>([]);

  private supportedResolutions = [
    { width: 2592, height: 1944 },
    { width: 2560, height: 1440 },
    { width: 1920, height: 1080 },
    { width: 1280, height: 720 },
    { width: 640, height: 480 }
  ];

  private availableCameras: MediaDeviceInfo[] = [];

  constructor() {}

  /**
   * Initialize the service with available cameras
   */
  setAvailableCameras(cameras: MediaDeviceInfo[]): void {
    this.availableCameras = cameras;
  }

  /**
   * Check if a camera is a "Trust" camera based on its label
   */
  isTrustCamera(deviceId: string): boolean {
    const camera = this.availableCameras.find(c => c.deviceId === deviceId);
    if (!camera) {
      return false;
    }
    // Check if the camera label contains "Trust"
    return camera.label.toLowerCase().includes('trust');
  }

  /**
   * Apply video constraints to a video track
   * For non-Trust cameras: sets to auto mode
   * For Trust cameras: applies manual constraints with capability checking
   */
  async applyVideoConstraints(videoTrack: MediaStreamTrack, deviceId?: string): Promise<void> {
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

  /**
   * Reassert manual focus and exposure settings on a video track
   */
  async reassertManualFocusAndExposure(videoTrack: MediaStreamTrack | null, selectedCameraId: string): Promise<void> {
    if (!videoTrack) return;

    // Only apply constraints to Trust cameras
    if (!this.isTrustCamera(selectedCameraId)) {
      console.log('Skipping constraint reassertion for non-Trust camera');
      return;
    }

    try {
      await videoTrack.applyConstraints({
        advanced: [{ focusMode: 'manual' } as any]
      });
    } catch (e) {
      console.warn('Reassert focus manual mode failed:', e);
    }
    try {
      await videoTrack.applyConstraints({
        advanced: [{ exposureMode: 'manual' } as any]
      });
    } catch (e) {
      console.warn('Reassert exposure manual mode failed:', e);
    }
    try {
      await videoTrack.applyConstraints({
        advanced: [{ focusDistance: this.focusValue() } as any]
      });
    } catch (e) {
      console.warn('Reapply focus distance failed:', e);
    }
    try {
      await videoTrack.applyConstraints({
        advanced: [{ exposureTime: this.shutterSpeedValue() } as any]
      });
    } catch (e) {
      console.warn('Reapply exposure time failed:', e);
    }
    try {
      await videoTrack.applyConstraints({
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

  /**
   * Apply focus distance constraint
   */
  async applyFocusDistance(distance: number, videoTrack: MediaStreamTrack | null, selectedCameraId: string): Promise<void> {
    if (!videoTrack) return;
    if (!this.isTrustCamera(selectedCameraId)) {
      return; // Skip constraints for non-Trust cameras
    }
    const clampedDistance = Math.max(0, Math.min(1023, distance));
    this.focusValue.set(clampedDistance);
    try {
      await videoTrack.applyConstraints({
        advanced: [{ focusMode: 'manual', focusDistance: clampedDistance } as any]
      });
    } catch (error) {
      console.error('Failed to set focus distance:', error);
    }
  }

  /**
   * Adjust focus by a delta value
   */
  adjustFocusBy(delta: number, videoTrack: MediaStreamTrack | null, selectedCameraId: string): void {
    this.applyFocusDistance(this.focusValue() + delta, videoTrack, selectedCameraId);
  }

  /**
   * Apply shutter speed constraint
   */
  async applyShutterSpeed(speed: number, videoTrack: MediaStreamTrack | null, selectedCameraId: string): Promise<void> {
    if (!videoTrack) return;
    if (!this.isTrustCamera(selectedCameraId)) {
      return; // Skip constraints for non-Trust cameras
    }
    const clampedSpeed = Math.max(1, Math.min(10000, speed));
    this.shutterSpeedValue.set(clampedSpeed);
    try {
      await videoTrack.applyConstraints({
        advanced: [{ exposureMode: 'manual', exposureTime: clampedSpeed } as any]
      });
    } catch (error) {
      console.error('Failed to set shutter speed:', error);
    }
  }

  /**
   * Adjust shutter speed by exposure stops
   */
  async adjustShutterSpeedBy(delta: number, videoTrack: MediaStreamTrack | null, selectedCameraId: string): Promise<void> {
    // Move to the next/previous stop
    const nextIndex = this.exposureStopIndex() + delta;
    const clamped = Math.max(0, Math.min(this.exposureStops.length - 1, nextIndex));
    if (clamped === this.exposureStopIndex()) return;
    this.setExposureStopByIndex(clamped);
    await this.applyShutterSpeed(this.shutterSpeedValue(), videoTrack, selectedCameraId);
  }

  /**
   * Format shutter speed value as a readable label (e.g., "1/200")
   */
  formatShutterLabel(us: number): string {
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

  /**
   * Get the nearest exposure stop for a given value
   */
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

  /**
   * Set exposure stop by value
   */
  private setExposureStopByValue(value: number): void {
    const idx = this.exposureStops.findIndex((v) => v === value);
    this.exposureStopIndex.set(idx >= 0 ? idx : 0);
    this.shutterSpeedValue.set(value);
  }

  /**
   * Set exposure stop by index
   */
  private setExposureStopByIndex(index: number): void {
    const clamped = Math.max(0, Math.min(this.exposureStops.length - 1, index));
    this.exposureStopIndex.set(clamped);
    this.shutterSpeedValue.set(this.exposureStops[clamped]);
  }

  /**
   * Apply brightness constraint
   */
  async applyBrightness(brightness: number, videoTrack: MediaStreamTrack | null, selectedCameraId: string): Promise<void> {
    if (!videoTrack) return;
    if (!this.isTrustCamera(selectedCameraId)) {
      return; // Skip constraints for non-Trust cameras
    }
    const clampedBrightness = Math.max(-64, Math.min(64, brightness));
    this.brightnessValue.set(clampedBrightness);
    try {
      await videoTrack.applyConstraints({
        advanced: [{ brightness: clampedBrightness } as any]
      });
    } catch (error) {
      console.error('Failed to set brightness:', error);
    }
  }

  /**
   * Adjust brightness by a delta value
   */
  async adjustBrightnessBy(delta: number, videoTrack: MediaStreamTrack | null, selectedCameraId: string): Promise<void> {
    await this.applyBrightness(this.brightnessValue() + delta, videoTrack, selectedCameraId);
  }

  /**
   * Apply contrast constraint
   */
  async applyContrast(contrast: number, videoTrack: MediaStreamTrack | null, selectedCameraId: string): Promise<void> {
    if (!videoTrack) return;
    if (!this.isTrustCamera(selectedCameraId)) {
      return; // Skip constraints for non-Trust cameras
    }
    const clampedContrast = Math.max(0, Math.min(100, contrast));
    this.contrastValue.set(clampedContrast);
    try {
      await videoTrack.applyConstraints({
        advanced: [{ contrast: clampedContrast } as any]
      });
    } catch (error) {
      console.error('Failed to set contrast:', error);
    }
  }

  /**
   * Adjust contrast by a delta value
   */
  async adjustContrastBy(delta: number, videoTrack: MediaStreamTrack | null, selectedCameraId: string): Promise<void> {
    await this.applyContrast(this.contrastValue() + delta, videoTrack, selectedCameraId);
  }

  /**
   * Apply exposure compensation constraint
   */
  async applyExposureCompensation(compensation: number, videoTrack: MediaStreamTrack | null, selectedCameraId: string): Promise<void> {
    if (!videoTrack) return;
    if (!this.isTrustCamera(selectedCameraId)) {
      return; // Skip constraints for non-Trust cameras
    }
    const clampedCompensation = Math.max(0, Math.min(128, compensation));
    this.exposureCompensationValue.set(clampedCompensation);
    try {
      await videoTrack.applyConstraints({
        advanced: [{ exposureCompensation: clampedCompensation } as any]
      });
    } catch (error) {
      console.error('Failed to set exposure compensation:', error);
    }
  }

  /**
   * Adjust exposure compensation by a delta value
   */
  async adjustExposureCompensationBy(delta: number, videoTrack: MediaStreamTrack | null, selectedCameraId: string): Promise<void> {
    await this.applyExposureCompensation(this.exposureCompensationValue() + delta, videoTrack, selectedCameraId);
  }

  /**
   * Apply resolution constraint
   */
  async applyResolution(resolutionStr: string, videoTrack: MediaStreamTrack | null, selectedCameraId: string): Promise<void> {
    if (!videoTrack) return;
    if (!this.isTrustCamera(selectedCameraId)) {
      return; // Skip constraints for non-Trust cameras
    }
    const resolution = this.supportedResolutions.find(
      r => `${r.width}x${r.height}` === resolutionStr
    );
    if (!resolution) {
      console.error(`Invalid resolution: ${resolutionStr}`);
      return;
    }

    try {
      await videoTrack.applyConstraints({
        advanced: [{ width: { ideal: resolution.width }, height: { ideal: resolution.height } } as any]
      });
      this.resolutionValue.set(resolutionStr);
    } catch (error) {
      console.error('Failed to set resolution:', error);
    }
  }

  /**
   * Probe available resolutions for a camera
   */
  async probeAvailableResolutions(deviceId?: string): Promise<{ width: number; height: number }[]> {
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

  /**
   * Format resolution as a string (e.g., "1280x720")
   */
  formatResolution(res: { width: number; height: number }): string {
    return `${res.width}x${res.height}`;
  }

  /**
   * Pick the default resolution from available options
   */
  pickDefaultResolution(available: { width: number; height: number }[]): { width: number; height: number } | null {
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
}
