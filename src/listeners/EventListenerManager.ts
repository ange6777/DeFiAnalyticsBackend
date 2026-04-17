import { EventEmitter } from 'events';
import { UniswapV2Listener } from './UniswapV2Listener';
import { config } from '@/config';

export class EventListenerManager extends EventEmitter {
  private listeners: Map<number, UniswapV2Listener> = new Map();
  private isRunning: boolean = false;

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('EventListenerManager is already running');
      return;
    }

    console.log('Starting EventListenerManager...');
    this.isRunning = true;

    try {
      await this.startChainListeners();
      this.emit('started');
      console.log('EventListenerManager started successfully');
    } catch (error) {
      console.error('Failed to start EventListenerManager:', error);
      this.isRunning = false;
      this.emit('error', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('Stopping EventListenerManager...');
    this.isRunning = false;

    const stopPromises = Array.from(this.listeners.values()).map(listener => 
      listener.stop().catch(error => 
        console.error('Error stopping listener:', error)
      )
    );

    await Promise.allSettled(stopPromises);
    this.listeners.clear();
    
    this.emit('stopped');
    console.log('EventListenerManager stopped');
  }

  private async startChainListeners(): Promise<void> {
    const chains = [
      { chainId: 1, rpcUrl: config.blockchain.ethereum.rpcUrl },
      { chainId: 137, rpcUrl: config.blockchain.polygon.rpcUrl },
      { chainId: 42161, rpcUrl: config.blockchain.arbitrum.rpcUrl },
    ];

    for (const chain of chains) {
      if (chain.rpcUrl) {
        try {
          const listener = new UniswapV2Listener(chain.chainId, chain.rpcUrl);
          
          listener.on('event', (event) => {
            this.emit('event', event);
          });

          listener.on('swap', (swap) => {
            this.emit('swap', swap);
          });

          listener.on('pool_updated', (poolUpdate) => {
            this.emit('pool_updated', poolUpdate);
          });

          listener.on('liquidity_added', (liquidityEvent) => {
            this.emit('liquidity_added', liquidityEvent);
          });

          listener.on('liquidity_removed', (liquidityEvent) => {
            this.emit('liquidity_removed', liquidityEvent);
          });

          listener.on('error', (error) => {
            console.error(`Listener error for chain ${chain.chainId}:`, error);
            this.emit('listener_error', { chainId: chain.chainId, error });
          });

          await listener.start();
          this.listeners.set(chain.chainId, listener);
          
          console.log(`Started listener for chain ${chain.chainId}`);
        } catch (error) {
          console.error(`Failed to start listener for chain ${chain.chainId}:`, error);
        }
      }
    }
  }

  getListener(chainId: number): UniswapV2Listener | undefined {
    return this.listeners.get(chainId);
  }

  async addPairToChain(chainId: number, pairAddress: string): Promise<void> {
    const listener = this.listeners.get(chainId);
    if (listener) {
      await listener.addPair(pairAddress);
      console.log(`Added pair ${pairAddress} to chain ${chainId} listener`);
    } else {
      throw new Error(`No listener found for chain ${chainId}`);
    }
  }

  async removePairFromChain(chainId: number, pairAddress: string): Promise<void> {
    const listener = this.listeners.get(chainId);
    if (listener) {
      listener.removeContractAddress(pairAddress);
      console.log(`Removed pair ${pairAddress} from chain ${chainId} listener`);
    } else {
      throw new Error(`No listener found for chain ${chainId}`);
    }
  }

  getActiveChains(): number[] {
    return Array.from(this.listeners.keys());
  }

  isListenerActive(chainId: number): boolean {
    return this.listeners.has(chainId);
  }

  async getListenerStatus(): Promise<{ [chainId: number]: boolean }> {
    const status: { [chainId: number]: boolean } = {};
    
    for (const [chainId, listener] of this.listeners) {
      try {
        status[chainId] = true;
      } catch (error) {
        status[chainId] = false;
      }
    }
    
    return status;
  }

  async restartListener(chainId: number): Promise<void> {
    const listener = this.listeners.get(chainId);
    if (listener) {
      await listener.stop();
      await listener.start();
      console.log(`Restarted listener for chain ${chainId}`);
    } else {
      throw new Error(`No listener found for chain ${chainId}`);
    }
  }

  async restartAllListeners(): Promise<void> {
    console.log('Restarting all listeners...');
    
    const restartPromises = Array.from(this.listeners.entries()).map(async ([chainId, listener]) => {
      try {
        await listener.stop();
        await listener.start();
        console.log(`Successfully restarted listener for chain ${chainId}`);
      } catch (error) {
        console.error(`Failed to restart listener for chain ${chainId}:`, error);
      }
    });

    await Promise.allSettled(restartPromises);
    console.log('All listeners restart attempt completed');
  }
}
