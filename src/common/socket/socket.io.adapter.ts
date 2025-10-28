// src/common/socket-io.adapter.ts
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';

export class SocketIoAdapter extends IoAdapter {
  createIOServer(port: number, options?: ServerOptions) {
  const base = (options ?? {}) as Partial<ServerOptions>;
  const final: ServerOptions = {
    ...base,
    path: '/socket.io',
    transports: ['websocket'],
    cors: { origin: '*', credentials: false },
    serveClient: false,
  } as ServerOptions;

  return super.createIOServer(port, final);
}

}
