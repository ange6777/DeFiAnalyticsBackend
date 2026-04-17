import { EventEmitter } from 'events';
import { ethers } from 'ethers';
import { IndexingStatus } from '@/types';
import db from '@/config/database';

export abstract class BaseIndexer extends EventEmitter {
  protected provider: ethers.JsonRpcProvider;
  protected chainId: number;
  protected contractAddress: string;
  protected eventName: string;
  protected isIndexing: boolean = false;
  protected lastIndexedBlock: number = 0;
  protected batchSize: number = 1000;
  protected maxRetries: number = 3;

  constructor(chainId: number, rpcUrl: string, contractAddress: string, eventName: string) {
    super();
    this.chainId = chainId;
    this.contractAddress = contractAddress;
    this.eventName = eventName;
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
  }

  abstract getContractABI(): any[];
  abstract processEvent(event: any): Promise<void>;

  async startIndexing(fromBlock?: number): Promise<void> {
    if (this.isIndexing) {
      console.log(`Indexer already running for ${this.contractAddress} - ${this.eventName}`);
      return;
    }

    console.log(`Starting indexing for ${this.contractAddress} - ${this.eventName}`);
    this.isIndexing = true;

    try {
      await this.loadIndexingStatus();
      
      const startBlock = fromBlock || this.lastIndexedBlock + 1;
      const currentBlock = await this.provider.getBlockNumber();
      
      await this.indexEvents(startBlock, currentBlock);
      
      this.emit('indexing_started', {
        contractAddress: this.contractAddress,
        eventName: this.eventName,
        startBlock,
        currentBlock,
      });
    } catch (error) {
      console.error(`Failed to start indexing for ${this.contractAddress}:`, error);
      this.isIndexing = false;
      this.emit('error', error);
      throw error;
    }
  }

  async stopIndexing(): Promise<void> {
    if (!this.isIndexing) {
      return;
    }

    console.log(`Stopping indexing for ${this.contractAddress} - ${this.eventName}`);
    this.isIndexing = false;
    this.emit('indexing_stopped', {
      contractAddress: this.contractAddress,
      eventName: this.eventName,
    });
  }

  protected async indexEvents(fromBlock: number, toBlock: number): Promise<void> {
    console.log(`Indexing events from block ${fromBlock} to ${toBlock}`);
    
    const contract = new ethers.Contract(
      this.contractAddress,
      this.getContractABI(),
      this.provider
    );

    let currentBlock = fromBlock;
    let retryCount = 0;

    while (currentBlock <= toBlock && this.isIndexing) {
      try {
        const endBlock = Math.min(currentBlock + this.batchSize - 1, toBlock);
        
        const events = await contract.queryFilter(
          contract.filters[this.eventName](),
          currentBlock,
          endBlock
        );

        console.log(`Found ${events.length} ${this.eventName} events from blocks ${currentBlock}-${endBlock}`);

        for (const event of events) {
          try {
            await this.processEvent(event);
            await this.saveIndexedEvent(event);
          } catch (error) {
            console.error(`Error processing event at block ${event.blockNumber}:`, error);
          }
        }

        await this.updateIndexingStatus(endBlock);
        this.lastIndexedBlock = endBlock;
        currentBlock = endBlock + 1;
        retryCount = 0;

        this.emit('batch_processed', {
          contractAddress: this.contractAddress,
          eventName: this.eventName,
          fromBlock: currentBlock - this.batchSize,
          toBlock: endBlock,
          eventCount: events.length,
        });

        if (events.length > 0) {
          await this.delay(100); // Brief delay to avoid rate limiting
        }

      } catch (error) {
        console.error(`Error indexing batch starting at block ${currentBlock}:`, error);
        retryCount++;
        
        if (retryCount >= this.maxRetries) {
          console.error(`Max retries exceeded for batch starting at block ${currentBlock}`);
          this.emit('error', error);
          throw error;
        }
        
        await this.delay(Math.pow(2, retryCount) * 1000); // Exponential backoff
      }
    }

    console.log(`Completed indexing for ${this.contractAddress} - ${this.eventName} up to block ${toBlock}`);
  }

  protected async saveIndexedEvent(event: any): Promise<void> {
    const eventData = {
      chain_id: this.chainId,
      block_number: event.blockNumber,
      transaction_hash: event.transactionHash,
      address: event.address,
      event_name: this.eventName,
      data: {
        args: event.args ? Array.from(event.args) : [],
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
        address: event.address,
        eventName: this.eventName,
      },
      timestamp: new Date(),
      processed: true,
    };

    await db('blockchain_events').insert(eventData);
  }

  protected async loadIndexingStatus(): Promise<void> {
    const status = await db('indexing_status')
      .where({
        chain_id: this.chainId,
        contract_address: this.contractAddress,
        event_name: this.eventName,
      })
      .first();

    if (status) {
      this.lastIndexedBlock = status.last_block_number;
      console.log(`Loaded indexing status: last indexed block ${this.lastIndexedBlock}`);
    } else {
      await this.createIndexingStatus();
    }
  }

  protected async createIndexingStatus(): Promise<void> {
    await db('indexing_status').insert({
      chain_id: this.chainId,
      contract_address: this.contractAddress,
      event_name: this.eventName,
      last_block_number: 0,
      last_indexed_at: new Date(),
      is_active: true,
    });
  }

  protected async updateIndexingStatus(blockNumber: number): Promise<void> {
    await db('indexing_status')
      .where({
        chain_id: this.chainId,
        contract_address: this.contractAddress,
        event_name: this.eventName,
      })
      .update({
        last_block_number: blockNumber,
        last_indexed_at: new Date(),
        is_active: this.isIndexing,
      });
  }

  async getIndexingProgress(): Promise<{
    contractAddress: string;
    eventName: string;
    lastIndexedBlock: number;
    currentBlock: number;
    progress: number;
  }> {
    const currentBlock = await this.provider.getBlockNumber();
    const progress = this.lastIndexedBlock > 0 
      ? (this.lastIndexedBlock / currentBlock) * 100 
      : 0;

    return {
      contractAddress: this.contractAddress,
      eventName: this.eventName,
      lastIndexedBlock: this.lastIndexedBlock,
      currentBlock,
      progress: Math.round(progress * 100) / 100,
    };
  }

  async reindex(fromBlock: number, toBlock?: number): Promise<void> {
    console.log(`Reindexing ${this.contractAddress} - ${this.eventName} from block ${fromBlock}`);
    
    await db('blockchain_events')
      .where({
        chain_id: this.chainId,
        address: this.contractAddress,
        event_name: this.eventName,
      })
      .where('block_number', '>=', fromBlock)
      .del();

    const currentBlock = toBlock || await this.provider.getBlockNumber();
    await this.indexEvents(fromBlock, currentBlock);
  }

  setBatchSize(size: number): void {
    this.batchSize = Math.max(1, Math.min(size, 10000));
    console.log(`Batch size set to ${this.batchSize}`);
  }

  setMaxRetries(retries: number): void {
    this.maxRetries = Math.max(0, retries);
    console.log(`Max retries set to ${this.maxRetries}`);
  }

  protected async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStats(): {
    contractAddress: string;
    eventName: string;
    chainId: number;
    isIndexing: boolean;
    lastIndexedBlock: number;
    batchSize: number;
    maxRetries: number;
  } {
    return {
      contractAddress: this.contractAddress,
      eventName: this.eventName,
      chainId: this.chainId,
      isIndexing: this.isIndexing,
      lastIndexedBlock: this.lastIndexedBlock,
      batchSize: this.batchSize,
      maxRetries: this.maxRetries,
    };
  }
}
