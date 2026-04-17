import db from '@/config/database';
import { Token } from '@/types';

export class TokenModel {
  static async create(token: Omit<Token, 'id' | 'createdAt' | 'updatedAt'>): Promise<Token> {
    const [createdToken] = await db('tokens')
      .insert({
        ...token,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');
    
    return this.mapFromDb(createdToken);
  }

  static async findByAddress(address: string, chainId: number): Promise<Token | null> {
    const token = await db('tokens')
      .where({ address, chain_id: chainId })
      .first();
    
    return token ? this.mapFromDb(token) : null;
  }

  static async findAll(chainId?: number): Promise<Token[]> {
    const query = db('tokens');
    if (chainId) {
      query.where('chain_id', chainId);
    }
    
    const tokens = await query.orderBy('created_at', 'desc');
    return tokens.map(this.mapFromDb);
  }

  static async update(id: string, updates: Partial<Token>): Promise<Token | null> {
    const [updatedToken] = await db('tokens')
      .where({ id })
      .update({
        ...updates,
        updated_at: new Date(),
      })
      .returning('*');
    
    return updatedToken ? this.mapFromDb(updatedToken) : null;
  }

  static async delete(id: string): Promise<boolean> {
    const deletedCount = await db('tokens').where({ id }).del();
    return deletedCount > 0;
  }

  private static mapFromDb(dbToken: any): Token {
    return {
      id: dbToken.id,
      address: dbToken.address,
      symbol: dbToken.symbol,
      name: dbToken.name,
      decimals: dbToken.decimals,
      chainId: dbToken.chain_id,
      totalSupply: dbToken.total_supply,
      createdAt: dbToken.created_at,
      updatedAt: dbToken.updated_at,
    };
  }
}
