declare module 'ws' {
  export class WebSocket {
    constructor(address: any, options?: any);
    static OPEN: number;
    static CONNECTING: number;
    static CLOSING: number;
    static CLOSED: number;
    readyState: number;
    send(data: any): void;
    close(): void;
    on(event: string, listener: (...args: any[]) => void): this;
  }
  export class WebSocketServer {
    constructor(options?: any);
    on(event: string, listener: (...args: any[]) => void): this;
    close(callback?: (err?: Error) => void): void;
  }
  export default WebSocket;
}
