/**
 * Line-buffered reader. Feed raw chunks; emits complete lines (split on \n).
 */
export class LineBuffer {
  private buf = "";
  feed(chunk: string): string[] {
    this.buf += chunk;
    const parts = this.buf.split(/\r?\n/);
    this.buf = parts.pop() ?? "";
    return parts.filter((l) => l.length > 0);
  }
  flush(): string[] {
    if (!this.buf) return [];
    const out = [this.buf];
    this.buf = "";
    return out;
  }
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface StreamHandlers {
  onLine: (line: string) => void;
  onStatus: (status: ConnectionStatus, detail?: string) => void;
}

/* ---------- Web Serial ---------- */

export class SerialStream {
  private port: any = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private buffer = new LineBuffer();
  private stopped = false;

  constructor(private handlers: StreamHandlers) {}

  static isSupported(): boolean {
    return typeof navigator !== "undefined" && "serial" in navigator;
  }

  async connect(baudRate = 115200) {
    if (!SerialStream.isSupported()) {
      this.handlers.onStatus("error", "Web Serial not supported in this browser");
      return;
    }
    try {
      this.handlers.onStatus("connecting");
      // @ts-ignore
      this.port = await navigator.serial.requestPort();
      await this.port!.open({ baudRate });
      this.handlers.onStatus("connected", `Serial @ ${baudRate}`);
      this.readLoop();
    } catch (e: any) {
      this.handlers.onStatus("error", e?.message ?? "Serial error");
      this.port = null;
    }
  }

  private async readLoop() {
    if (!this.port?.readable) return;
    const decoder = new TextDecoder();
    this.reader = this.port.readable.getReader();
    try {
      while (!this.stopped) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) {
          const text = decoder.decode(value, { stream: true });
          for (const line of this.buffer.feed(text)) this.handlers.onLine(line);
        }
      }
    } catch (e: any) {
      this.handlers.onStatus("error", e?.message ?? "Read error");
    } finally {
      try { this.reader?.releaseLock(); } catch {}
      this.reader = null;
    }
  }

  async disconnect() {
    this.stopped = true;
    try { await this.reader?.cancel(); } catch {}
    try { await this.port?.close(); } catch {}
    this.port = null;
    this.stopped = false;
    this.handlers.onStatus("disconnected");
  }
}

/* ---------- Web Bluetooth (Nordic UART Service) ---------- */

export const NUS_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
export const NUS_TX_CHAR_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"; // device → app (notify)
export const NUS_RX_CHAR_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"; // app → device (write)

export class BluetoothStream {
  private device: any = null;
  private txChar: any = null;
  private buffer = new LineBuffer();
  private decoder = new TextDecoder();

  constructor(private handlers: StreamHandlers) {}

  static isSupported(): boolean {
    return typeof navigator !== "undefined" && "bluetooth" in navigator;
  }

  private connected = false;
  private onDisconnect = () => {
    if (!this.connected) return;
    this.connected = false;
    this.handlers.onStatus("disconnected");
  };

  async connect() {
    if (!BluetoothStream.isSupported()) {
      this.handlers.onStatus("error", "Web Bluetooth not supported in this browser. Use Chrome/Edge desktop or Android Chrome — iOS is not supported.");
      return;
    }
    try {
      this.handlers.onStatus("connecting");
      // @ts-ignore
      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [NUS_SERVICE_UUID] }],
        optionalServices: [NUS_SERVICE_UUID],
      });
      if (!this.device?.gatt) throw new Error("Selected device has no GATT server");

      this.device.addEventListener("gattserverdisconnected", this.onDisconnect);

      // Retry GATT connect — first attempt often fails right after pairing
      let server: any = null;
      let lastErr: any = null;
      for (let i = 0; i < 3; i++) {
        try {
          server = await this.device.gatt.connect();
          if (server?.connected) break;
        } catch (err) {
          lastErr = err;
          await new Promise((r) => setTimeout(r, 400));
        }
      }
      if (!server?.connected) throw lastErr ?? new Error("Could not connect to GATT server");

      const service = await server.getPrimaryService(NUS_SERVICE_UUID);
      this.txChar = await service.getCharacteristic(NUS_TX_CHAR_UUID);
      this.txChar.addEventListener("characteristicvaluechanged", this.onValue);
      await this.txChar.startNotifications();
      this.connected = true;
      this.handlers.onStatus("connected", `BLE · ${this.device.name ?? "device"}`);
    } catch (e: any) {
      const msg = e?.message ?? String(e ?? "Bluetooth error");
      this.handlers.onStatus("error", msg);
      try { this.device?.gatt?.disconnect(); } catch {}
      this.device = null;
      this.txChar = null;
      this.connected = false;
    }
  }

  private onValue = (ev: Event) => {
    const value = (ev.target as any).value as DataView;
    const text = this.decoder.decode(value.buffer);
    for (const line of this.buffer.feed(text)) this.handlers.onLine(line);
  };

  async disconnect() {
    try {
      this.txChar?.removeEventListener("characteristicvaluechanged", this.onValue);
      await this.txChar?.stopNotifications();
    } catch {}
    try { this.device?.gatt?.disconnect(); } catch {}
    this.device = null;
    this.txChar = null;
    this.handlers.onStatus("disconnected");
  }
}

