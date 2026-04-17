import { BaseIndexer } from './BaseIndexer';
import { ethers } from 'ethers';
import db from '@/config/database';

const UNISWAP_V2_FACTORY_ABI = [
  'event PairCreated(address indexed token0, address indexed token1, address pair, uint)'
];

export class UniswapV2Indexer extends BaseIndexer {
  async processEvent(event: any): Promise<void> {
    const { token0, token1, pair } = event.args;
    
    try {
      const existingPool = await db('pools')
        .where({ address: pair, chain_id: this.chainId })
        .first();

      if (!existingPool) {
        const token0Info = await this.getTokenInfo(token0);
        const token1Info = await this.getTokenInfo(token1);

        await db('pools').insert({
          address: pair,
          token0_address: token0,
          token1_address: token1,
          token0_symbol: token0Info.symbol,
          token1_symbol: token1Info.symbol,
          fee: 3000, // 0.3%
          chain_id: this.chainId,
          protocol: 'uniswap_v2',
          created_at: new Date(),
          updated_at: new Date(),
        });

        console.log(`Created new pool record for pair ${pair}`);
        
        this.emit('pool_created', {
          address: pair,
          token0,
          token1,
          token0Symbol: token0Info.symbol,
          token1Symbol: token1Info.symbol,
          chainId: this.chainId,
          blockNumber: event.blockNumber,
        });
      }
    } catch (error) {
      console.error(`Error processing PairCreated event for ${pair}:`, error);
      throw error;
    }
  }

  getContractABI(): any[] {
    return UNISWAP_V2_FACTORY_ABI;
  }

  private async getTokenInfo(tokenAddress: string): Promise<{ symbol: string; name: string; decimals: number }> {
    try {
      const tokenContract = new ethers.Contract(
        tokenAddress,
        [
          'function symbol() view returns (string)',
          'function name() view returns (string)',
          'function decimals() view returns (uint8)'
        ],
        this.provider
      );

      const [symbol, name, decimals] = await Promise.all([
        tokenContract.symbol(),
        tokenContract.name(),
        tokenContract.decimals(),
      ]);

      return { symbol, name, decimals: Number(decimals) };
    } catch (error) {
      console.error(`Error getting token info for ${tokenAddress}:`, error);
      return { symbol: 'UNKNOWN', name: 'Unknown Token', decimals: 18 };
    }
  }
}
