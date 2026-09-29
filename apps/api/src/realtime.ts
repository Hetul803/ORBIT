import type { WebSocket } from 'ws';

export interface OrbitEvent {
  readonly type: string;
  readonly at: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export class RealtimeHub {
  private readonly sockets = new Map<string, Set<WebSocket>>();

  public add(userId: string, socket: WebSocket): void {
    const current = this.sockets.get(userId) ?? new Set<WebSocket>();
    current.add(socket);
    this.sockets.set(userId, current);
  }

  public remove(userId: string, socket: WebSocket): void {
    const current = this.sockets.get(userId);
    current?.delete(socket);
    if (current?.size === 0) this.sockets.delete(userId);
  }

  public publish(userId: string, event: Omit<OrbitEvent, 'at'>): void {
    const encoded = JSON.stringify({ ...event, at: new Date().toISOString() });
    for (const socket of this.sockets.get(userId) ?? []) {
      if (socket.readyState === socket.OPEN) socket.send(encoded);
    }
  }
}
