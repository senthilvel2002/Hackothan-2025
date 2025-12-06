type WebSocketMessage = {
  userid: string;
  message: string;
  images: Array<{
    filename: string;
    base64: string;
  }>;
  documents: Array<{
    filename: string;
    base64: string;
  }>;
};

type WebSocketResponse =
  | { type: "status"; status: string }
  | { type: "message"; userid: string; message: string }
  | { type: "stream"; userid: string; message_delta: string }
  | { type: "tool_call"; userid: string; status: string }
  | { type: "tool_result"; userid: string; status: string }
  | { type: "error"; userid: string; message: string }
  | { type: "done" };

type MessageHandler = (message: WebSocketResponse) => void;

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private messageHandlers: Set<MessageHandler> = new Set();

  constructor(url?: string) {
    this.url = url || process.env.NEXT_PUBLIC_WEBSOCKET_URL || "ws://localhost:8000/chat";
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // If already connected, resolve immediately
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          resolve();
          return;
        }

        // If connecting, wait for it
        if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.onopen = () => {
            console.log("WebSocket connected");
            this.reconnectAttempts = 0;
            resolve();
          };
          return;
        }

        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          console.log("WebSocket connected");
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onerror = (error) => {
          console.error("WebSocket error:", error);
          // Don't reject on error, let it try to reconnect
          if (this.ws?.readyState !== WebSocket.CONNECTING && this.ws?.readyState !== WebSocket.OPEN) {
            reject(error);
          }
        };

        this.ws.onmessage = (event) => {
          try {
            console.log("Raw WebSocket message:", event.data);
            const data = JSON.parse(event.data) as WebSocketResponse;
            console.log("Parsed WebSocket message:", data);
            this.messageHandlers.forEach((handler) => handler(data));
          } catch (error) {
            console.error("Error parsing WebSocket message:", error, event.data);
          }
        };

        this.ws.onclose = () => {
          console.log("WebSocket closed");
          this.ws = null;
          this.attemptReconnect();
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => {
        console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
        this.connect().catch(() => {
          // Reconnection will be attempted again
        });
      }, this.reconnectDelay * this.reconnectAttempts);
    }
  }

  send(message: WebSocketMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn("WebSocket is not connected. Attempting to connect...");
      this.connect()
        .then(() => {
          if (this.ws) {
            this.ws.send(JSON.stringify(message));
          }
        })
        .catch((error) => {
          console.error("Failed to send message via WebSocket:", error);
        });
      return;
    }

    try {
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      console.error("Error sending WebSocket message:", error);
    }
  }

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.messageHandlers.clear();
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

// Singleton instance
let wsClient: WebSocketClient | null = null;

export function getWebSocketClient(): WebSocketClient {
  if (!wsClient) {
    wsClient = new WebSocketClient();
    // Auto-connect on first use
    wsClient.connect().catch((error) => {
      console.warn("Initial WebSocket connection failed:", error);
    });
  }
  return wsClient;
}
