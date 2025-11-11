import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

type ManualMode = 'manual' | 'continuous';

export interface CameraDesiredState {
  exposureMode?: ManualMode;
  exposureTime?: number;
  focusMode?: ManualMode;
  focusDistance?: number;
  whiteBalanceMode?: ManualMode;
  colorTemperature?: number;
  brightness?: number;
  contrast?: number;
  exposureCompensation?: number;
  width?: number;
  height?: number;
  frameRate?: number;
}

export interface CameraAppliedState extends Required<CameraDesiredState> {}

@Injectable({ providedIn: 'root' })
export class CameraCoordinatorService {
  private track: MediaStreamTrack | null = null;
  private caps: any = null;
  private queue: Promise<void> = Promise.resolve();
  private desired: CameraDesiredState = {
    exposureMode: 'manual',
    focusMode: 'manual',
    whiteBalanceMode: 'manual',
  };

  desired$ = new BehaviorSubject<CameraDesiredState>({ ...this.desired });
  applied$ = new BehaviorSubject<Partial<CameraAppliedState>>({});

  setTrack(track: MediaStreamTrack): void {
    this.track = track;
    try {
      this.caps = (this.track as any).getCapabilities?.() || null;
    } catch {
      this.caps = null;
    }
  }

  async applyPatch(patch: CameraDesiredState): Promise<CameraAppliedState> {
    // Merge into desired and clamp
    this.desired = this.clampDesired({ ...this.desired, ...patch });
    this.desired$.next({ ...this.desired });

    await (this.queue = this.queue.then(() => this.applyAtomic()));

    const applied = this.getAppliedFromSettings();
    this.applied$.next(applied);
    return applied as CameraAppliedState;
  }

  private async applyAtomic(): Promise<void> {
    if (!this.track) return;
    const d = this.desired;
    const adv: any = {
      exposureMode: d.exposureMode ?? 'manual',
      exposureTime: d.exposureTime,
      focusMode: d.focusMode ?? 'manual',
      focusDistance: d.focusDistance,
      whiteBalanceMode: d.whiteBalanceMode ?? 'manual',
      colorTemperature: d.colorTemperature,
      brightness: d.brightness,
      contrast: d.contrast,
      exposureCompensation: d.exposureCompensation,
    };

    const constraints: any = { advanced: [adv] };

    if (d.width && d.height) {
      constraints.width = { exact: d.width };
      constraints.height = { exact: d.height };
      if (d.frameRate) constraints.frameRate = { ideal: d.frameRate };
    }

    await this.track.applyConstraints(constraints as MediaTrackConstraints);
  }

  private clampDesired(d: CameraDesiredState): CameraDesiredState {
    const c = this.caps || {};
    const clamp = (v: number | undefined, min: number | undefined, max: number | undefined, step?: number) => {
      if (v == null) return v;
      let x = v;
      if (typeof min === 'number') x = Math.max(min, x);
      if (typeof max === 'number') x = Math.min(max, x);
      if (typeof step === 'number' && step > 0) x = Math.round(x / step) * step;
      return x;
    };

    d.exposureTime = clamp(d.exposureTime, c.exposureTime?.min, c.exposureTime?.max, c.exposureTime?.step);
    d.focusDistance = clamp(d.focusDistance, c.focusDistance?.min, c.focusDistance?.max, c.focusDistance?.step);
    d.colorTemperature = clamp(d.colorTemperature, c.colorTemperature?.min, c.colorTemperature?.max, c.colorTemperature?.step);
    d.brightness = clamp(d.brightness, c.brightness?.min, c.brightness?.max, c.brightness?.step);
    d.contrast = clamp(d.contrast, c.contrast?.min, c.contrast?.max, c.contrast?.step);
    d.exposureCompensation = clamp(d.exposureCompensation, c.exposureCompensation?.min, c.exposureCompensation?.max, c.exposureCompensation?.step);
    return d;
  }

  private getAppliedFromSettings(): Partial<CameraAppliedState> {
    if (!this.track) return {};
    try {
      const s: any = (this.track as any).getSettings?.() || {};
      return {
        exposureMode: s.exposureMode ?? this.desired.exposureMode ?? 'manual',
        exposureTime: s.exposureTime ?? this.desired.exposureTime ?? 0,
        focusMode: s.focusMode ?? this.desired.focusMode ?? 'manual',
        focusDistance: s.focusDistance ?? this.desired.focusDistance ?? 0,
        whiteBalanceMode: s.whiteBalanceMode ?? this.desired.whiteBalanceMode ?? 'manual',
        colorTemperature: s.colorTemperature ?? this.desired.colorTemperature ?? 0,
        brightness: s.brightness ?? this.desired.brightness ?? 0,
        contrast: s.contrast ?? this.desired.contrast ?? 0,
        exposureCompensation: s.exposureCompensation ?? this.desired.exposureCompensation ?? 0,
        width: s.width ?? this.desired.width ?? 0,
        height: s.height ?? this.desired.height ?? 0,
        frameRate: s.frameRate ?? this.desired.frameRate ?? 0,
      } as Partial<CameraAppliedState>;
    } catch {
      return { ...this.desired } as Partial<CameraAppliedState>;
    }
  }
}

