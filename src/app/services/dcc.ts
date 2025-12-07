import { Injectable, signal } from '@angular/core';

// Web Serial API type definitions
declare global {
  interface Navigator {
    serial: Serial;
  }

  interface Serial {
    requestPort(): Promise<SerialPort>;
  }

  interface SerialPort {
    open(options: { baudRate: number }): Promise<void>;
    close(): Promise<void>;
    readable: ReadableStream<Uint8Array> | null;
    writable: WritableStream<Uint8Array> | null;
  }
}

@Injectable({
  providedIn: 'root',
})
export class DccService {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;

  locoAddress = signal(3);
  locoSpeed = signal(0);
  locoDirection = signal(true);
  invertDirectionDisplay = signal(false);
  activeFunctions = signal<Set<number>>(new Set([0])); // F0 on by default
  trackPower = signal(false);
  isConnected = signal(false);
  lastResponse = signal('');

  private storageKey = 'home-master-loco-states';

  private defaultState(): LocoState {
    return {
      speed: 0,
      direction: true,
      invertDisplay: false,
      functions: [0] // F0 on by default
    };
  }

  private loadStoredStates(): Record<string, LocoState> {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return {};
      return JSON.parse(raw) as Record<string, LocoState>;
    } catch {
      return {};
    }
  }

  private saveStoredStates(states: Record<string, LocoState>): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(states));
    } catch {
      // ignore storage errors
    }
  }

  private loadState(address: number): LocoState {
    const states = this.loadStoredStates();
    return states[address] ?? this.defaultState();
  }

  private persistCurrentState(): void {
    const states = this.loadStoredStates();
    states[this.locoAddress()] = {
      speed: this.locoSpeed(),
      direction: this.locoDirection(),
      invertDisplay: this.invertDirectionDisplay(),
      functions: Array.from(this.activeFunctions())
    };
    this.saveStoredStates(states);
  }

  private applyState(state: LocoState): void {
    this.locoSpeed.set(state.speed);
    this.locoDirection.set(state.direction);
    this.invertDirectionDisplay.set(state.invertDisplay);
    this.activeFunctions.set(new Set(state.functions));
  }

  async connect(): Promise<void> {
    try {
      // Request serial port from user
      this.port = await navigator.serial.requestPort();

      // Open port at 115200 baud (DCC-EX default)
      await this.port.open({ baudRate: 115200 });

      this.isConnected.set(true);

      // Set up reader and writer
      if (this.port.readable) {
        this.reader = this.port.readable.getReader();
        this.startReading();
      }

      if (this.port.writable) {
        this.writer = this.port.writable.getWriter();
      }

      this.trackPower.set(false);
      console.log('Connected to DCC-EX');
    } catch (error) {
      console.error('Failed to connect:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.reader) {
      await this.reader.cancel();
      this.reader.releaseLock();
      this.reader = null;
    }

    if (this.writer) {
      this.writer.releaseLock();
      this.writer = null;
    }

    if (this.port) {
      await this.port.close();
      this.port = null;
    }

    this.trackPower.set(false);
    this.isConnected.set(false);
    console.log('Disconnected from DCC-EX');
  }

  private async startReading(): Promise<void> {
    const decoder = new TextDecoder();

    try {
      while (this.reader) {
        const { value, done } = await this.reader.read();
        if (done) break;

        const text = decoder.decode(value);
        this.lastResponse.set(text);
        console.log('DCC-EX:', text);
      }
    } catch (error) {
      console.error('Read error:', error);
    }
  }

  setLocoAddress(address: number): void {
    this.locoAddress.set(address);
    const state = this.loadState(address);
    this.applyState(state);
  }

  async sendCommand(command: string): Promise<void> {
    if (!this.writer) {
      throw new Error('Not connected');
    }

    const encoder = new TextEncoder();
    const data = encoder.encode(command + '\n');

    await this.writer.write(data);
    console.log('Sent:', command);
  }

  async setTrackPower(on: boolean): Promise<void> {
    await this.sendCommand(on ? '<1>' : '<0>');
    this.trackPower.set(on);
  }

  // Simple test command
  async getStatus(): Promise<void> {
    await this.sendCommand('<s>');
  }

  // Control a locomotive
  async setLocoSpeed(address: number, speed: number, forward: boolean): Promise<void> {
    this.locoAddress.set(address);
    this.locoSpeed.set(speed);
    this.locoDirection.set(forward);
    const direction = forward ? 1 : 0;
    await this.sendCommand(`<t 1 ${address} ${speed} ${direction}>`);
    this.persistCurrentState();
  }

  async setLocoDirection(forward: boolean): Promise<void> {
    this.locoDirection.set(forward);
    await this.setLocoSpeed(this.locoAddress(), this.locoSpeed(), forward);
  }

  setInvertDisplay(value: boolean): void {
    this.invertDirectionDisplay.set(value);
    this.persistCurrentState();
  }

  updateFunctions(fnSet: Set<number>): void {
    this.activeFunctions.set(fnSet);
    this.persistCurrentState();
  }

  // Emergency stop
  async emergencyStop(): Promise<void> {
    await this.sendCommand('<e>');
  }
}

interface LocoState {
  speed: number;
  direction: boolean;
  invertDisplay: boolean;
  functions: number[];
}
