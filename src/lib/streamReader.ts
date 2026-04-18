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

/* ---------- WebSocket ---------- */

export class WebSocketStream {
  private ws: WebSocket | null = null;
  private buffer = new LineBuffer();

  constructor(private handlers: StreamHandlers) {}

  connect(url: string) {
    try {
      this.handlers.onStatus("connecting");
      this.ws = new WebSocket(url);
      this.ws.onopen = () => this.handlers.onStatus("connected", url);
      this.ws.onmessage = (ev) => {
        const data = typeof ev.data === "string" ? ev.data : "";
        if (!data) return;
        const lines = this.buffer.feed(data.endsWith("\n") ? data : data + "\n");
        for (const line of lines) this.handlers.onLine(line);
      };
      this.ws.onerror = () => this.handlers.onStatus("error", "WebSocket error");
      this.ws.onclose = () => this.handlers.onStatus("disconnected");
    } catch (e: any) {
      this.handlers.onStatus("error", e?.message ?? "WebSocket error");
    }
  }

  disconnect() {
    try { this.ws?.close(); } catch {}
    this.ws = null;
  }
}
