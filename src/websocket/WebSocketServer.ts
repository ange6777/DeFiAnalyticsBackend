import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { WebSocketMessage } from '@/types';
import { config } from '@/config';

export interface WebSocketClient {
  id: string;
  ws: WebSocket;
  subscriptions: Set<string>;
  lastPing: Date;
  ip: string;
}

export class WebSocketManager extends EventEmitter {
  private wss: WebSocket.Server;
  private clients: Map<string, WebSocketClient> = new Map();
  private isRunning: boolean = false;

  constructor() {
    super();
    this.wss = new WebSocket.Server({ 
      port: config.wsPort,
      perMessageDeflate: false,
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('WebSocket server is already running');
      return;
    }

    console.log(`Starting WebSocket server on port ${config.wsPort}...`);

    this.wss.on('connection', (ws: WebSocket, req) => {
      this.handleConnection(ws, req);
    });

    this.wss.on('error', (error) => {
      console.error('WebSocket server error:', error);
      this.emit('error', error);
    });

    this.startHeartbeat();
    this.isRunning = true;
    console.log(`WebSocket server started on port ${config.wsPort}`);
    this.emit('started');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('Stopping WebSocket server...');
    
    this.clients.forEach((client) => {
      client.ws.close();
    });
    this.clients.clear();

    return new Promise((resolve) => {
      this.wss.close(() => {
        this.isRunning = false;
        console.log('WebSocket server stopped');
        this.emit('stopped');
        resolve();
      });
    });
  }

  private handleConnection(ws: WebSocket, req: any): void {
    const clientId = this.generateClientId();
    const ip = req.socket.remoteAddress || 'unknown';

    const client: WebSocketClient = {
      id: clientId,
      ws,
      subscriptions: new Set(),
      lastPing: new Date(),
      ip,
    };

    this.clients.set(clientId, client);
    console.log(`Client connected: ${clientId} from ${ip}`);

    ws.on('message', (data: WebSocket.Data) => {
      this.handleMessage(client, data);
    });

    ws.on('close', () => {
      this.handleDisconnection(clientId);
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error for client ${clientId}:`, error);
      this.handleDisconnection(clientId);
    });

    this.sendMessage(client, {
      type: 'connection',
      data: { clientId, message: 'Connected to DeFi Analytics WebSocket' },
      timestamp: new Date(),
    });

    this.emit('client_connected', { clientId, ip });
  }

  private handleMessage(client: WebSocketClient, data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'subscribe':
          this.handleSubscription(client, message.data);
          break;
        case 'unsubscribe':
          this.handleUnsubscription(client, message.data);
          break;
        case 'ping':
          this.handlePing(client);
          break;
        default:
          this.sendMessage(client, {
            type: 'error',
            data: { message: `Unknown message type: ${message.type}` },
            timestamp: new Date(),
          });
      }
    } catch (error) {
      console.error(`Error parsing message from client ${client.id}:`, error);
      this.sendMessage(client, {
        type: 'error',
        data: { message: 'Invalid JSON format' },
        timestamp: new Date(),
      });
    }
  }

  private handleSubscription(client: WebSocketClient, data: any): void {
    const { channels } = data;
    
    if (!Array.isArray(channels)) {
      this.sendMessage(client, {
        type: 'error',
        data: { message: 'Channels must be an array' },
        timestamp: new Date(),
      });
      return;
    }

    const validChannels = [
      'swaps',
      'pool_updates',
      'liquidity_added',
      'liquidity_removed',
      'price_updates',
      'metrics',
    ];

    const subscribedChannels: string[] = [];
    
    channels.forEach((channel: string) => {
      if (validChannels.includes(channel)) {
        client.subscriptions.add(channel);
        subscribedChannels.push(channel);
      }
    });

    this.sendMessage(client, {
      type: 'subscription_confirmed',
      data: { channels: subscribedChannels },
      timestamp: new Date(),
    });

    console.log(`Client ${client.id} subscribed to: ${subscribedChannels.join(', ')}`);
  }

  private handleUnsubscription(client: WebSocketClient, data: any): void {
    const { channels } = data;
    
    if (!Array.isArray(channels)) {
      this.sendMessage(client, {
        type: 'error',
        data: { message: 'Channels must be an array' },
        timestamp: new Date(),
      });
      return;
    }

    const unsubscribedChannels: string[] = [];
    
    channels.forEach((channel: string) => {
      if (client.subscriptions.has(channel)) {
        client.subscriptions.delete(channel);
        unsubscribedChannels.push(channel);
      }
    });

    this.sendMessage(client, {
      type: 'unsubscription_confirmed',
      data: { channels: unsubscribedChannels },
      timestamp: new Date(),
    });

    console.log(`Client ${client.id} unsubscribed from: ${unsubscribedChannels.join(', ')}`);
  }

  private handlePing(client: WebSocketClient): void {
    client.lastPing = new Date();
    this.sendMessage(client, {
      type: 'pong',
      data: { timestamp: new Date() },
      timestamp: new Date(),
    });
  }

  private handleDisconnection(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      console.log(`Client disconnected: ${clientId}`);
      this.clients.delete(clientId);
      this.emit('client_disconnected', { clientId, ip: client.ip });
    }
  }

  private sendMessage(client: WebSocketClient, message: WebSocketMessage): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(JSON.stringify(message));
      } catch (error) {
        console.error(`Error sending message to client ${client.id}:`, error);
        this.handleDisconnection(client.id);
      }
    }
  }

  broadcast(message: WebSocketMessage, channel?: string): void {
    let sentCount = 0;
    
    this.clients.forEach((client) => {
      if (!channel || client.subscriptions.has(channel)) {
        this.sendMessage(client, message);
        sentCount++;
      }
    });

    console.log(`Broadcasted message to ${sentCount} clients${channel ? ` on channel ${channel}` : ''}`);
  }

  broadcastSwap(swapData: any): void {
    this.broadcast({
      type: 'event',
      data: {
        event: 'swap',
        ...swapData,
      },
      timestamp: new Date(),
    }, 'swaps');
  }

  broadcastPoolUpdate(poolData: any): void {
    this.broadcast({
      type: 'event',
      data: {
        event: 'pool_update',
        ...poolData,
      },
      timestamp: new Date(),
    }, 'pool_updates');
  }

  broadcastLiquidityAdded(liquidityData: any): void {
    this.broadcast({
      type: 'event',
      data: {
        event: 'liquidity_added',
        ...liquidityData,
      },
      timestamp: new Date(),
    }, 'liquidity_added');
  }

  broadcastLiquidityRemoved(liquidityData: any): void {
    this.broadcast({
      type: 'event',
      data: {
        event: 'liquidity_removed',
        ...liquidityData,
      },
      timestamp: new Date(),
    }, 'liquidity_removed');
  }

  broadcastPriceUpdate(priceData: any): void {
    this.broadcast({
      type: 'price',
      data: priceData,
      timestamp: new Date(),
    }, 'price_updates');
  }

  broadcastMetrics(metricsData: any): void {
    this.broadcast({
      type: 'metrics',
      data: metricsData,
      timestamp: new Date(),
    }, 'metrics');
  }

  private startHeartbeat(): void {
    setInterval(() => {
      const now = new Date();
      const timeout = 30000; // 30 seconds

      this.clients.forEach((client, clientId) => {
        if (now.getTime() - client.lastPing.getTime() > timeout) {
          console.log(`Client ${clientId} timed out`);
          client.ws.close();
          this.handleDisconnection(clientId);
        } else {
          this.sendMessage(client, {
            type: 'ping',
            data: { timestamp: now },
            timestamp: now,
          });
        }
      });
    }, 15000); // Send ping every 15 seconds
  }

  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getConnectedClients(): Array<{ id: string; ip: string; subscriptions: string[] }> {
    return Array.from(this.clients.values()).map(client => ({
      id: client.id,
      ip: client.ip,
      subscriptions: Array.from(client.subscriptions),
    }));
  }

  getClientCount(): number {
    return this.clients.size;
  }

  getSubscriptionStats(): { [channel: string]: number } {
    const stats: { [channel: string]: number } = {};
    
    this.clients.forEach((client) => {
      client.subscriptions.forEach((channel) => {
        stats[channel] = (stats[channel] || 0) + 1;
      });
    });

    return stats;
  }
}
