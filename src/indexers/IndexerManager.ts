import { EventEmitter } from 'events';
import { BaseIndexer } from './BaseIndexer';
import { UniswapV2Indexer } from './UniswapV2Indexer';
import { config } from '@/config';

export class IndexerManager extends EventEmitter {
  private indexers: Map<string, BaseIndexer> = new Map();
  private isRunning: boolean = false;

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('IndexerManager is already running');
      return;
    }

    console.log('Starting IndexerManager...');
    this.isRunning = true;

    try {
      await this.startDefaultIndexers();
      this.emit('started');
      console.log('IndexerManager started successfully');
    } catch (error) {
      console.error('Failed to start IndexerManager:', error);
      this.isRunning = false;
      this.emit('error', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('Stopping IndexerManager...');
    this.isRunning = false;

    const stopPromises = Array.from(this.indexers.values()).map(indexer => 
      indexer.stopIndexing().catch(error => 
        console.error('Error stopping indexer:', error)
      )
    );

    await Promise.allSettled(stopPromises);
    this.indexers.clear();
    
    this.emit('stopped');
    console.log('IndexerManager stopped');
  }

  private async startDefaultIndexers(): Promise<void> {
    const defaultIndexers = [
      {
        chainId: 1,
        rpcUrl: config.blockchain.ethereum.rpcUrl,
        contracts: [
          { address: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f', eventName: 'PairCreated' },
        ],
      },
      {
        chainId: 137,
        rpcUrl: config.blockchain.polygon.rpcUrl,
        contracts: [
          { address: '0x5757371414417b8C6Ead9b2241DF8378B4570BD2', eventName: 'PairCreated' },
        ],
      },
    ];

    for (const indexerConfig of defaultIndexers) {
      if (indexerConfig.rpcUrl) {
        for (const contract of indexerConfig.contracts) {
          try {
            const indexer = new UniswapV2Indexer(
              indexerConfig.chainId,
              indexerConfig.rpcUrl,
              contract.address,
              contract.eventName
            );

            indexer.on('batch_processed', (data) => {
              this.emit('batch_processed', data);
            });

            indexer.on('error', (error) => {
              console.error(`Indexer error for ${contract.address}:`, error);
              this.emit('indexer_error', { contract: contract.address, error });
            });

            await indexer.startIndexing();
            
            const key = `${indexerConfig.chainId}-${contract.address}-${contract.eventName}`;
            this.indexers.set(key, indexer);
            
            console.log(`Started indexer for ${key}`);
          } catch (error) {
            console.error(`Failed to start indexer for ${contract.address}:`, error);
          }
        }
      }
    }
  }

  async addIndexer(indexer: BaseIndexer): Promise<void> {
    const key = `${indexer.chainId}-${indexer.contractAddress}-${indexer.eventName}`;
    
    if (this.indexers.has(key)) {
      throw new Error(`Indexer already exists for ${key}`);
    }

    indexer.on('batch_processed', (data) => {
      this.emit('batch_processed', data);
    });

    indexer.on('error', (error) => {
      console.error(`Indexer error for ${indexer.contractAddress}:`, error);
      this.emit('indexer_error', { 
        contract: indexer.contractAddress, 
        eventName: indexer.eventName,
        error 
      });
    });

    await indexer.startIndexing();
    this.indexers.set(key, indexer);
    
    console.log(`Added indexer for ${key}`);
    this.emit('indexer_added', { key, indexer });
  }

  async removeIndexer(chainId: number, contractAddress: string, eventName: string): Promise<void> {
    const key = `${chainId}-${contractAddress}-${eventName}`;
    const indexer = this.indexers.get(key);
    
    if (indexer) {
      await indexer.stopIndexing();
      this.indexers.delete(key);
      console.log(`Removed indexer for ${key}`);
      this.emit('indexer_removed', { key });
    } else {
      throw new Error(`No indexer found for ${key}`);
    }
  }

  getIndexer(chainId: number, contractAddress: string, eventName: string): BaseIndexer | undefined {
    const key = `${chainId}-${contractAddress}-${eventName}`;
    return this.indexers.get(key);
  }

  getAllIndexers(): Array<{ key: string; indexer: BaseIndexer }> {
    return Array.from(this.indexers.entries()).map(([key, indexer]) => ({ key, indexer }));
  }

  async getIndexingProgress(): Promise<Array<{
    key: string;
    progress: any;
  }>> {
    const progressPromises = Array.from(this.indexers.entries()).map(async ([key, indexer]) => {
      try {
        const progress = await indexer.getIndexingProgress();
        return { key, progress };
      } catch (error) {
        console.error(`Error getting progress for ${key}:`, error);
        return { 
          key, 
          progress: { 
            error: error instanceof Error ? error.message : 'Unknown error' 
          } 
        };
      }
    });

    return Promise.all(progressPromises);
  }

  async reindexIndexer(
    chainId: number, 
    contractAddress: string, 
    eventName: string, 
    fromBlock: number, 
    toBlock?: number
  ): Promise<void> {
    const key = `${chainId}-${contractAddress}-${eventName}`;
    const indexer = this.indexers.get(key);
    
    if (!indexer) {
      throw new Error(`No indexer found for ${key}`);
    }

    await indexer.reindex(fromBlock, toBlock);
    console.log(`Reindexed ${key} from block ${fromBlock}`);
    this.emit('indexer_reindexed', { key, fromBlock, toBlock });
  }

  async pauseIndexer(chainId: number, contractAddress: string, eventName: string): Promise<void> {
    const key = `${chainId}-${contractAddress}-${eventName}`;
    const indexer = this.indexers.get(key);
    
    if (!indexer) {
      throw new Error(`No indexer found for ${key}`);
    }

    await indexer.stopIndexing();
    console.log(`Paused indexer for ${key}`);
    this.emit('indexer_paused', { key });
  }

  async resumeIndexer(chainId: number, contractAddress: string, eventName: string): Promise<void> {
    const key = `${chainId}-${contractAddress}-${eventName}`;
    const indexer = this.indexers.get(key);
    
    if (!indexer) {
      throw new Error(`No indexer found for ${key}`);
    }

    await indexer.startIndexing();
    console.log(`Resumed indexer for ${key}`);
    this.emit('indexer_resumed', { key });
  }

  setIndexerBatchSize(
    chainId: number, 
    contractAddress: string, 
    eventName: string, 
    batchSize: number
  ): void {
    const key = `${chainId}-${contractAddress}-${eventName}`;
    const indexer = this.indexers.get(key);
    
    if (!indexer) {
      throw new Error(`No indexer found for ${key}`);
    }

    indexer.setBatchSize(batchSize);
    console.log(`Set batch size to ${batchSize} for ${key}`);
  }

  setIndexerMaxRetries(
    chainId: number, 
    contractAddress: string, 
    eventName: string, 
    maxRetries: number
  ): void {
    const key = `${chainId}-${contractAddress}-${eventName}`;
    const indexer = this.indexers.get(key);
    
    if (!indexer) {
      throw new Error(`No indexer found for ${key}`);
    }

    indexer.setMaxRetries(maxRetries);
    console.log(`Set max retries to ${maxRetries} for ${key}`);
  }

  getActiveIndexersCount(): number {
    return Array.from(this.indexers.values()).filter(indexer => 
      (indexer as any).isIndexing
    ).length;
  }

  getTotalIndexersCount(): number {
    return this.indexers.size;
  }

  async getIndexerStats(): Promise<Array<{
    key: string;
    stats: any;
  }>> {
    return Array.from(this.indexers.entries()).map(([key, indexer]) => ({
      key,
      stats: indexer.getStats(),
    }));
  }

  async restartAllIndexers(): Promise<void> {
    console.log('Restarting all indexers...');
    
    const restartPromises = Array.from(this.indexers.values()).map(async (indexer) => {
      try {
        await indexer.stopIndexing();
        await indexer.startIndexing();
        console.log(`Successfully restarted indexer for ${indexer.contractAddress}`);
      } catch (error) {
        console.error(`Failed to restart indexer for ${indexer.contractAddress}:`, error);
      }
    });

    await Promise.allSettled(restartPromises);
    console.log('All indexers restart attempt completed');
  }
}
