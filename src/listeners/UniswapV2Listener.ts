import { BaseEventListener } from './BaseEventListener';
import { Swap, Pool } from '@/types';
import db from '@/config/database';

const UNISWAP_V2_PAIR_ABI = [
  'event Sync(uint112 reserve0, uint112 reserve1)',
  'event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Mint(address indexed sender, uint amount0, uint amount1)',
  'event Burn(address indexed sender, uint amount0, uint amount1, address indexed to)',
];

const UNISWAP_V2_FACTORY_ADDRESSES = {
  1: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f', // Ethereum
  137: '0x5757371414417b8C6Ead9b2241DF8378B4570BD2', // Polygon
  42161: '0xf1D7CC64Fb4452F05c498126312eBE29f30Fbcf9', // Arbitrum
};

export class UniswapV2Listener extends BaseEventListener {
  private factoryAddress: string;

  constructor(chainId: number, rpcUrl: string) {
    super(chainId, rpcUrl);
    this.factoryAddress = UNISWAP_V2_FACTORY_ADDRESSES[chainId as keyof typeof UNISWAP_V2_FACTORY_ADDRESSES];
    if (this.factoryAddress) {
      this.addContractAddress(this.factoryAddress);
    }
  }

  getContractABI(): any[] {
    return UNISWAP_V2_PAIR_ABI;
  }

  getEventSignatures(): string[] {
    return ['Sync', 'Swap', 'Transfer', 'Mint', 'Burn'];
  }

  async processEvent(event: any): Promise<void> {
    const eventName = event.fragment?.name;
    
    switch (eventName) {
      case 'Sync':
        await this.handleSyncEvent(event);
        break;
      case 'Swap':
        await this.handleSwapEvent(event);
        break;
      case 'Mint':
        await this.handleMintEvent(event);
        break;
      case 'Burn':
        await this.handleBurnEvent(event);
        break;
      default:
        console.log(`Unhandled Uniswap V2 event: ${eventName}`);
    }
  }

  private async handleSyncEvent(event: any): Promise<void> {
    const { reserve0, reserve1 } = event.args;
    const pairAddress = event.address;

    try {
      await db('pools')
        .where({ address: pairAddress, chain_id: this.chainId })
        .update({
          reserve0: reserve0.toString(),
          reserve1: reserve1.toString(),
          updated_at: new Date(),
        });

      this.emit('pool_updated', {
        address: pairAddress,
        reserve0: reserve0.toString(),
        reserve1: reserve1.toString(),
        chainId: this.chainId,
      });
    } catch (error) {
      console.error(`Error handling Sync event for ${pairAddress}:`, error);
    }
  }

  private async handleSwapEvent(event: any): Promise<void> {
    const { sender, amount0In, amount1In, amount0Out, amount1Out, to } = event.args;
    const pairAddress = event.address;

    try {
      const pool = await db('pools')
        .where({ address: pairAddress, chain_id: this.chainId })
        .first();

      if (!pool) {
        console.warn(`Pool not found for address: ${pairAddress}`);
        return;
      }

      const swapData: Omit<Swap, 'id'> = {
        transactionHash: event.transactionHash,
        poolAddress: pairAddress,
        userAddress: sender,
        tokenInAddress: amount0In > 0 ? pool.token0_address : pool.token1_address,
        tokenOutAddress: amount0Out > 0 ? pool.token0_address : pool.token1_address,
        tokenInAmount: amount0In > 0 ? amount0In.toString() : amount1In.toString(),
        tokenOutAmount: amount0Out > 0 ? amount0Out.toString() : amount1Out.toString(),
        blockNumber: event.blockNumber,
        timestamp: new Date(),
        chainId: this.chainId,
      };

      await db('swaps').insert({
        transaction_hash: swapData.transactionHash,
        pool_address: swapData.poolAddress,
        user_address: swapData.userAddress,
        token_in_address: swapData.tokenInAddress,
        token_out_address: swapData.tokenOutAddress,
        token_in_amount: swapData.tokenInAmount,
        token_out_amount: swapData.tokenOutAmount,
        block_number: swapData.blockNumber,
        timestamp: swapData.timestamp,
        chain_id: swapData.chainId,
      });

      this.emit('swap', swapData);
    } catch (error) {
      console.error(`Error handling Swap event:`, error);
    }
  }

  private async handleMintEvent(event: any): Promise<void> {
    const { sender, amount0, amount1 } = event.args;
    const pairAddress = event.address;

    try {
      this.emit('liquidity_added', {
        address: pairAddress,
        userAddress: sender,
        amount0: amount0.toString(),
        amount1: amount1.toString(),
        chainId: this.chainId,
        blockNumber: event.blockNumber,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error(`Error handling Mint event:`, error);
    }
  }

  private async handleBurnEvent(event: any): Promise<void> {
    const { sender, amount0, amount1, to } = event.args;
    const pairAddress = event.address;

    try {
      this.emit('liquidity_removed', {
        address: pairAddress,
        userAddress: sender,
        to,
        amount0: amount0.toString(),
        amount1: amount1.toString(),
        chainId: this.chainId,
        blockNumber: event.blockNumber,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error(`Error handling Burn event:`, error);
    }
  }

  async addPair(pairAddress: string): Promise<void> {
    this.addContractAddress(pairAddress);
    
    try {
      const pairContract = new this.provider.Contract(pairAddress, this.getContractABI());
      const [token0, token1, reserves] = await Promise.all([
        pairContract.token0(),
        pairContract.token1(),
        pairContract.getReserves(),
      ]);

      const existingPool = await db('pools')
        .where({ address: pairAddress, chain_id: this.chainId })
        .first();

      if (!existingPool) {
        await db('pools').insert({
          address: pairAddress,
          token0_address: token0,
          token1_address: token1,
          token0_symbol: await this.getTokenSymbol(token0),
          token1_symbol: await this.getTokenSymbol(token1),
          fee: 3000, // 0.3%
          chain_id: this.chainId,
          protocol: 'uniswap_v2',
          reserve0: reserves[0].toString(),
          reserve1: reserves[1].toString(),
          created_at: new Date(),
          updated_at: new Date(),
        });
      }
    } catch (error) {
      console.error(`Error adding pair ${pairAddress}:`, error);
    }
  }

  private async getTokenSymbol(tokenAddress: string): Promise<string> {
    try {
      const tokenContract = new this.provider.Contract(
        tokenAddress,
        ['function symbol() view returns (string)']
      );
      return await tokenContract.symbol();
    } catch (error) {
      console.error(`Error getting token symbol for ${tokenAddress}:`, error);
      return 'UNKNOWN';
    }
  }
}
