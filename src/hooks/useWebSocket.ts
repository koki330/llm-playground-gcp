'use client';

import { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';

export function useWebSocket() {
  const [messages, setMessages] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const ws = useRef<WebSocket | null>(null);
  // clientIdをリロード間で永続化するためにuseRefを使用
  const clientId = useRef<string>(uuidv4());

  useEffect(() => {
    // サーバーサイドでは実行しない
    if (typeof window === 'undefined') return;

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const wsUrl = `${protocol}://${window.location.host}?clientId=${clientId.current}`;
      
      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
      };

      ws.current.onmessage = (event) => {
        setMessages((prev) => [...prev, event.data]);
      };

      ws.current.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
        // 5秒後に再接続を試みる
        setTimeout(connect, 5000);
      };

      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        ws.current?.close();
      };
    };

    connect();

    // コンポーネントのアンマウント時にクリーンアップ
    return () => {
      if (ws.current) {
        ws.current.onclose = null; // 再接続ロジックを無効化
        ws.current.close();
      }
    };
  }, []);

  return { messages, isConnected, clientId: clientId.current };
}
