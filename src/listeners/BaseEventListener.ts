import { ethers } from 'ethers';
import { EventEmitter } from 'events';
import { BlockchainEvent } from '@/types';
import db from '@/config/database';
import { config } from '@/config';

export abstract class BaseEventListener extends EventEmitter {
  protected provider: ethers.JsonRpcProvider;
  protected chainId: number;
  protected contractAddresses: string[] = [];
  protected isListening: boolean = false;

  constructor(chainId: number, rpcUrl: string) {
    super();
    this.chainId = chainId;
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
  }

  abstract getContractABI(): any[];
  abstract getEventSignatures(): string[];
  abstract processEvent(event: any): Promise<void>;

  async start(): Promise<void> {
    if (this.isListening) {
      console.log(`Listener already running for chain ${this.chainId}`);
      return;
    }

    console.log(`Starting event listener for chain ${this.chainId}`);
    this.isListening = true;

    try {
      await this.setupEventListeners();
      this.emit('started', { chainId: this.chainId });
    } catch (error) {
      console.error(`Failed to start listener for chain ${this.chainId}:`, error);
      this.isListening = false;
      this.emit('error', error);
    }
  }

  async stop(): Promise<void> {
    if (!this.isListening) {
      return;
    }

    console.log(`Stopping event listener for chain ${this.chainId}`);
    this.isListening = false;
    this.provider.removeAllListeners();
    this.emit('stopped', { chainId: this.chainId });
  }

  protected async setupEventListeners(): Promise<void> {
    const eventSignatures = this.getEventSignatures();
    
    for (const address of this.contractAddresses) {
      const contract = new ethers.Contract(address, this.getContractABI(), this.provider);
      
      for (const signature of eventSignatures) {
        contract.on(signature, async (...args) => {
          try {
            const event = args[args.length - 1];
            await this.handleEvent(event, signature);
          } catch (error) {
            console.error(`Error processing event from ${address}:`, error);
            this.emit('error', error);
          }
        });
      }
    }

    this.provider.on('error', (error) => {
      console.error(`Provider error for chain ${this.chainId}:`, error);
      this.emit('error', error);
    });

    this.provider.on('block', async (blockNumber) => {
      this.emit('block', { chainId: this.chainId, blockNumber });
    });
  }

  protected async handleEvent(event: any, eventName: string): Promise<void> {
    const blockchainEvent: Omit<BlockchainEvent, 'id'> = {
      chainId: this.chainId,
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      address: event.address,
      eventName,
      data: {
        args: event.args ? Array.from(event.args) : [],
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
        address: event.address,
        eventName,
      },
      timestamp: new Date(),
      processed: false,
    };

    try {
      await this.saveEvent(blockchainEvent);
      await this.processEvent(event);
      
      this.emit('event', {
        type: 'blockchain_event',
        data: blockchainEvent,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error(`Error handling event ${eventName}:`, error);
      this.emit('error', error);
    }
  }

  protected async saveEvent(event: Omit<BlockchainEvent, 'id'>): Promise<void> {
    await db('blockchain_events').insert({
      chain_id: event.chainId,
      block_number: event.blockNumber,
      transaction_hash: event.transactionHash,
      address: event.address,
      event_name: event.eventName,
      data: event.data,
      timestamp: event.timestamp,
      processed: event.processed,
    });
  }

  protected async getLastProcessedBlock(address: string, eventName: string): Promise<number> {
    const result = await db('blockchain_events')
      .where({
        address,
        event_name: eventName,
        chain_id: this.chainId,
      })
      .max('block_number as last_block')
      .first();

    return result?.last_block || 0;
  }

  async getUnprocessedEvents(): Promise<BlockchainEvent[]> {
    const events = await db('blockchain_events')
      .where({ chain_id: this.chainId, processed: false })
      .orderBy('block_number', 'asc')
      .limit(100);

    return events.map((event: any) => ({
      id: event.id,
      chainId: event.chain_id,
      blockNumber: event.block_number,
      transactionHash: event.transaction_hash,
      address: event.address,
      eventName: event.event_name,
      data: event.data,
      timestamp: event.timestamp,
      processed: event.processed,
    }));
  }

  async markEventAsProcessed(eventId: string): Promise<void> {
    await db('blockchain_events')
      .where({ id: eventId })
      .update({ processed: true });
  }

  addContractAddress(address: string): void {
    if (!this.contractAddresses.includes(address)) {
      this.contractAddresses.push(address);
      if (this.isListening) {
        this.setupEventListeners();
      }
    }
  }

  removeContractAddress(address: string): void {
    const index = this.contractAddresses.indexOf(address);
    if (index > -1) {
      this.contractAddresses.splice(index, 1);
    }
  }
}
