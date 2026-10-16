declare module 'ws' {
  import { EventEmitter } from 'node:events';

  export class WebSocket extends EventEmitter {
    constructor(address: any, options?: any);
    static OPEN: number;
    static CONNECTING: number;
    static CLOSING: number;
    static CLOSED: number;
    readyState: number;
    send(data: any, cb?: (err?: Error) => void): void;
    close(code?: number, data?: any): void;
    ping(data?: any, mask?: boolean, cb?: (err?: Error) => void): void;
    pong(data?: any, mask?: boolean, cb?: (err?: Error) => void): void;
    terminate(): void;
    on(event: string, listener: (...args: any[]) => void): this;
    once(event: string, listener: (...args: any[]) => void): this;
    off(event: string, listener: (...args: any[]) => void): this;
  }

  export class WebSocketServer extends EventEmitter {
    constructor(options?: any, callback?: () => void);
    clients: Set<WebSocket>;
    close(callback?: (err?: Error) => void): void;
    handleUpgrade(request: any, socket: any, head: any, callback: (client: WebSocket) => void): void;
    on(event: string, listener: (...args: any[]) => void): this;
    once(event: string, listener: (...args: any[]) => void): this;
    off(event: string, listener: (...args: any[]) => void): this;
  }

  export default WebSocket;
}

