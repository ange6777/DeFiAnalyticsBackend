import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from '@/config';
import { apiLimiter } from '@/middleware/rateLimiter';
import { errorHandler, notFoundHandler } from '@/middleware/errorHandler';
import analyticsRoutes from '@/routes/analytics';
import { EventListenerManager } from '@/listeners/EventListenerManager';
import { WebSocketManager } from '@/websocket/WebSocketServer';
import { IndexerManager } from '@/indexers/IndexerManager';
import { OffChainStateManager } from '@/services/OffChainStateManager';

class DeFiAnalyticsBackend {
  private app: express.Application;
  private eventListenerManager: EventListenerManager;
  private webSocketManager: WebSocketManager;
  private indexerManager: IndexerManager;
  private offChainStateManager: OffChainStateManager;

  constructor() {
    this.app = express();
    this.eventListenerManager = new EventListenerManager();
    this.webSocketManager = new WebSocketManager();
    this.indexerManager = new IndexerManager();
    this.offChainStateManager = new OffChainStateManager();
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
    this.setupEventHandlers();
  }

  private setupMiddleware(): void {
    this.app.use(helmet());
    this.app.use(cors());
    this.app.use(compression());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    this.app.use(apiLimiter);
  }

  private setupRoutes(): void {
    this.app.use('/api/analytics', analyticsRoutes);
    
    this.app.get('/health', async (req, res) => {
      try {
        const health = await this.offChainStateManager.healthCheck();
        res.json({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          services: {
            database: health.database,
            redis: health.redis,
            eventListeners: this.eventListenerManager.getActiveChains().length > 0,
            webSocket: this.webSocketManager.getClientCount() > 0,
            indexers: this.indexerManager.getActiveIndexersCount() > 0,
          },
        });
      } catch (error) {
        res.status(500).json({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    this.app.get('/stats', async (req, res) => {
      try {
        const stats = {
          webSocket: {
            connectedClients: this.webSocketManager.getClientCount(),
            subscriptions: this.webSocketManager.getSubscriptionStats(),
          },
          indexers: {
            total: this.indexerManager.getTotalIndexersCount(),
            active: this.indexerManager.getActiveIndexersCount(),
            progress: await this.indexerManager.getIndexingProgress(),
          },
          eventListeners: {
            activeChains: this.eventListenerManager.getActiveChains(),
            status: await this.eventListenerManager.getListenerStatus(),
          },
          cache: await this.offChainStateManager.getCacheInfo(),
        };
        
        res.json(stats);
      } catch (error) {
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });
  }

  private setupErrorHandling(): void {
    this.app.use(notFoundHandler);
    this.app.use(errorHandler);
  }

  private setupEventHandlers(): void {
    this.eventListenerManager.on('swap', (swapData) => {
      this.webSocketManager.broadcastSwap(swapData);
    });

    this.eventListenerManager.on('pool_updated', (poolData) => {
      this.webSocketManager.broadcastPoolUpdate(poolData);
    });

    this.eventListenerManager.on('liquidity_added', (liquidityData) => {
      this.webSocketManager.broadcastLiquidityAdded(liquidityData);
    });

    this.eventListenerManager.on('liquidity_removed', (liquidityData) => {
      this.webSocketManager.broadcastLiquidityRemoved(liquidityData);
    });

    this.indexerManager.on('batch_processed', (data) => {
      console.log(`Indexing batch processed: ${data.contractAddress} - ${data.eventName}`);
    });

    this.indexerManager.on('error', (error) => {
      console.error('Indexer error:', error);
    });

    this.eventListenerManager.on('error', (error) => {
      console.error('Event listener error:', error);
    });
  }

  async start(): Promise<void> {
    try {
      console.log('Starting DeFi Analytics Backend...');

      await this.offChainStateManager.start();
      console.log('✓ Off-chain state manager started');

      await this.webSocketManager.start();
      console.log('✓ WebSocket server started');

      await this.eventListenerManager.start();
      console.log('✓ Event listeners started');

      await this.indexerManager.start();
      console.log('✓ Indexer manager started');

      this.app.listen(config.port, () => {
        console.log(`✓ HTTP server started on port ${config.port}`);
        console.log(`🚀 DeFi Analytics Backend is running!`);
        console.log(`📊 API available at: http://localhost:${config.port}/api/analytics`);
        console.log(`🔌 WebSocket server on port: ${config.wsPort}`);
        console.log(`🏥 Health check: http://localhost:${config.port}/health`);
        console.log(`📈 Stats: http://localhost:${config.port}/stats`);
      });

      this.setupGracefulShutdown();
    } catch (error) {
      console.error('Failed to start DeFi Analytics Backend:', error);
      process.exit(1);
    }
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      console.log(`\nReceived ${signal}. Starting graceful shutdown...`);
      
      try {
        await this.eventListenerManager.stop();
        console.log('✓ Event listeners stopped');

        await this.indexerManager.stop();
        console.log('✓ Indexer manager stopped');

        await this.webSocketManager.stop();
        console.log('✓ WebSocket server stopped');

        await this.offChainStateManager.stop();
        console.log('✓ Off-chain state manager stopped');

        console.log('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }
}

const backend = new DeFiAnalyticsBackend();
backend.start().catch((error) => {
  console.error('Failed to start backend:', error);
  process.exit(1);
});
