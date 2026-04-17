import { EventEmitter } from 'events';
import { OffChainState } from '@/types';
import db from '@/config/database';
import Redis from 'ioredis';
import { config } from '@/config';

export class OffChainStateManager extends EventEmitter {
  private redis: Redis;
  private cacheExpiry: number = 3600; // 1 hour
  private isRunning: boolean = false;

  constructor() {
    super();
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password || undefined,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('OffChainStateManager is already running');
      return;
    }

    console.log('Starting OffChainStateManager...');
    
    try {
      await this.redis.ping();
      this.isRunning = true;
      console.log('OffChainStateManager started successfully');
      this.emit('started');
    } catch (error) {
      console.error('Failed to start OffChainStateManager:', error);
      this.emit('error', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('Stopping OffChainStateManager...');
    this.isRunning = false;
    
    await this.redis.quit();
    console.log('OffChainStateManager stopped');
    this.emit('stopped');
  }

  async setState(key: string, value: any, persistToDb: boolean = true): Promise<void> {
    try {
      const serializedValue = JSON.stringify(value);
      
      await this.redis.setex(key, this.cacheExpiry, serializedValue);
      
      if (persistToDb) {
        await db('off_chain_state').insert({
          key,
          value: serializedValue,
          updated_at: new Date(),
        }).onConflict('key').merge();
      }

      this.emit('state_updated', { key, value });
    } catch (error) {
      console.error(`Error setting state for key ${key}:`, error);
      throw error;
    }
  }

  async getState<T>(key: string): Promise<T | null> {
    try {
      let cachedValue = await this.redis.get(key);
      
      if (cachedValue) {
        return JSON.parse(cachedValue) as T;
      }

      const dbRecord = await db('off_chain_state')
        .where({ key })
        .first();

      if (dbRecord) {
        const value = JSON.parse(dbRecord.value) as T;
        await this.redis.setex(key, this.cacheExpiry, JSON.stringify(value));
        return value;
      }

      return null;
    } catch (error) {
      console.error(`Error getting state for key ${key}:`, error);
      return null;
    }
  }

  async deleteState(key: string): Promise<void> {
    try {
      await this.redis.del(key);
      await db('off_chain_state').where({ key }).del();
      
      this.emit('state_deleted', { key });
    } catch (error) {
      console.error(`Error deleting state for key ${key}:`, error);
      throw error;
    }
  }

  async setStateWithTTL(key: string, value: any, ttlSeconds: number, persistToDb: boolean = true): Promise<void> {
    try {
      const serializedValue = JSON.stringify(value);
      
      await this.redis.setex(key, ttlSeconds, serializedValue);
      
      if (persistToDb) {
        await db('off_chain_state').insert({
          key,
          value: serializedValue,
          updated_at: new Date(),
        }).onConflict('key').merge();
      }

      this.emit('state_updated', { key, value, ttl: ttlSeconds });
    } catch (error) {
      console.error(`Error setting state with TTL for key ${key}:`, error);
      throw error;
    }
  }

  async incrementCounter(key: string, amount: number = 1): Promise<number> {
    try {
      const newValue = await this.redis.incrby(key, amount);
      await this.redis.expire(key, this.cacheExpiry);
      
      await db('off_chain_state').insert({
        key,
        value: JSON.stringify(newValue),
        updated_at: new Date(),
      }).onConflict('key').merge();

      this.emit('counter_incremented', { key, amount, newValue });
      return newValue;
    } catch (error) {
      console.error(`Error incrementing counter for key ${key}:`, error);
      throw error;
    }
  }

  async getMultipleStates<T>(keys: string[]): Promise<{ [key: string]: T | null }> {
    try {
      const results: { [key: string]: T | null } = {};
      
      const cachedValues = await this.redis.mget(...keys);
      
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const cachedValue = cachedValues[i];
        
        if (cachedValue) {
          results[key] = JSON.parse(cachedValue) as T;
        } else {
          results[key] = await this.getState<T>(key);
        }
      }
      
      return results;
    } catch (error) {
      console.error('Error getting multiple states:', error);
      throw error;
    }
  }

  async setMultipleStates(states: { [key: string]: any }, persistToDb: boolean = true): Promise<void> {
    try {
      const pipeline = this.redis.pipeline();
      
      for (const [key, value] of Object.entries(states)) {
        pipeline.setex(key, this.cacheExpiry, JSON.stringify(value));
      }
      
      await pipeline.exec();
      
      if (persistToDb) {
        const dbRecords = Object.entries(states).map(([key, value]) => ({
          key,
          value: JSON.stringify(value),
          updated_at: new Date(),
        }));
        
        await db('off_chain_state').insert(dbRecords).onConflict('key').merge();
      }

      this.emit('multiple_states_updated', { states });
    } catch (error) {
      console.error('Error setting multiple states:', error);
      throw error;
    }
  }

  async getKeysByPattern(pattern: string): Promise<string[]> {
    try {
      return await this.redis.keys(pattern);
    } catch (error) {
      console.error(`Error getting keys by pattern ${pattern}:`, error);
      return [];
    }
  }

  async clearCache(): Promise<void> {
    try {
      await this.redis.flushdb();
      console.log('Cache cleared');
      this.emit('cache_cleared');
    } catch (error) {
      console.error('Error clearing cache:', error);
      throw error;
    }
  }

  async getCacheInfo(): Promise<{
    usedMemory: string;
    totalMemory: string;
    keysCount: number;
    connectedClients: number;
  }> {
    try {
      const info = await this.redis.info('memory');
      const clientInfo = await this.redis.info('clients');
      
      const usedMemory = this.parseMemoryInfo(info, 'used_memory_human');
      const totalMemory = this.parseMemoryInfo(info, 'maxmemory_human');
      const keysCount = await this.redis.dbsize();
      const connectedClients = this.parseClientInfo(clientInfo, 'connected_clients');
      
      return {
        usedMemory,
        totalMemory,
        keysCount,
        connectedClients,
      };
    } catch (error) {
      console.error('Error getting cache info:', error);
      throw error;
    }
  }

  private parseMemoryInfo(info: string, key: string): string {
    const lines = info.split('\r\n');
    for (const line of lines) {
      if (line.startsWith(key)) {
        return line.split(':')[1];
      }
    }
    return 'unknown';
  }

  private parseClientInfo(info: string, key: string): number {
    const lines = info.split('\r\n');
    for (const line of lines) {
      if (line.startsWith(key)) {
        return parseInt(line.split(':')[1]);
      }
    }
    return 0;
  }

  async backupToDatabase(): Promise<void> {
    try {
      const keys = await this.getKeysByPattern('*');
      let backedUpCount = 0;
      
      for (const key of keys) {
        const value = await this.redis.get(key);
        if (value) {
          await db('off_chain_state').insert({
            key,
            value,
            updated_at: new Date(),
          }).onConflict('key').merge();
          backedUpCount++;
        }
      }
      
      console.log(`Backed up ${backedUpCount} keys to database`);
      this.emit('backup_completed', { backedUpCount });
    } catch (error) {
      console.error('Error backing up to database:', error);
      throw error;
    }
  }

  async restoreFromDatabase(): Promise<void> {
    try {
      const dbRecords = await db('off_chain_state').select();
      let restoredCount = 0;
      
      const pipeline = this.redis.pipeline();
      
      for (const record of dbRecords) {
        pipeline.setex(record.key, this.cacheExpiry, record.value);
        restoredCount++;
      }
      
      await pipeline.exec();
      
      console.log(`Restored ${restoredCount} keys from database`);
      this.emit('restore_completed', { restoredCount });
    } catch (error) {
      console.error('Error restoring from database:', error);
      throw error;
    }
  }

  setCacheExpiry(seconds: number): void {
    this.cacheExpiry = Math.max(1, seconds);
    console.log(`Cache expiry set to ${seconds} seconds`);
  }

  getCacheExpiry(): number {
    return this.cacheExpiry;
  }

  async healthCheck(): Promise<{
    redis: boolean;
    database: boolean;
    cacheHitRate?: number;
  }> {
    const health = {
      redis: false,
      database: false,
    } as any;

    try {
      await this.redis.ping();
      health.redis = true;
    } catch (error) {
      console.error('Redis health check failed:', error);
    }

    try {
      await db('off_chain_state').first();
      health.database = true;
    } catch (error) {
      console.error('Database health check failed:', error);
    }

    return health;
  }
}
