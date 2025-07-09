import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { WebSocketServer, WebSocket } from 'ws';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// クライアントを管理するためのMap
const clients = new Map<string, WebSocket>();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws, req) => {
    // 接続時に一意なIDを付与（例としてURLから取得）
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const clientId = url.searchParams.get('clientId');

    if (!clientId || clients.has(clientId)) {
      console.log('Connection rejected: Invalid or duplicate clientId');
      ws.close();
      return;
    }

    clients.set(clientId, ws);
    console.log(`WebSocket client connected: ${clientId}`);

    ws.on('message', (message) => {
      console.log(`Received from ${clientId}: ${message}`);
      // ここでメッセージをブロードキャストしたり、特定のクライアントに送信したりできる
    });

    ws.on('close', () => {
      clients.delete(clientId);
      console.log(`WebSocket client disconnected: ${clientId}`);
    });
  });

  // 特定のクライアントにメッセージを送信する関数をグローバルにエクスポート（あるいは別の方法で共有）
  (global as any).sendToClient = (clientId: string, message: string) => {
    const client = clients.get(clientId);
    if (client && client.readyState === WebSocket.OPEN) {
      client.send(message);
      return true;
    }
    return false;
  };


  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
