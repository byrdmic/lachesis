// Debug logging utility for Lachesis
// Captures log messages and emits them to subscribers

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogEntry = {
  timestamp: Date;
  level: LogLevel;
  message: string;
  data?: unknown;
};

type LogSubscriber = (entry: LogEntry) => void;

class DebugLogger {
  private subscribers: Set<LogSubscriber> = new Set();
  private logs: LogEntry[] = [];
  private maxLogs = 100;
  private _enabled = false;

  get enabled(): boolean {
    return this._enabled;
  }

  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
  }

  subscribe(callback: LogSubscriber): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  clear(): void {
    this.logs = [];
  }

  private log(level: LogLevel, message: string, data?: unknown): void {
    if (!this._enabled) return;

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      data,
    };

    this.logs.push(entry);

    // Keep only the last maxLogs entries
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Notify subscribers
    for (const subscriber of this.subscribers) {
      subscriber(entry);
    }
  }

  debug(message: string, data?: unknown): void {
    this.log("debug", message, data);
  }

  info(message: string, data?: unknown): void {
    this.log("info", message, data);
  }

  warn(message: string, data?: unknown): void {
    this.log("warn", message, data);
  }

  error(message: string, data?: unknown): void {
    this.log("error", message, data);
  }
}

// Singleton instance
export const debugLog = new DebugLogger();
