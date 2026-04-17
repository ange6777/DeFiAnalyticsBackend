export interface BlockchainEvent {
  id?: string;
  chainId: number;
  blockNumber: number;
  transactionHash: string;
  address: string;
  eventName: string;
  data: any;
  timestamp: Date;
  processed: boolean;
}

export interface Token {
  id?: string;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  chainId: number;
  totalSupply?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Pool {
  id?: string;
  address: string;
  token0Address: string;
  token1Address: string;
  token0Symbol: string;
  token1Symbol: string;
  fee: number;
  chainId: number;
  protocol: 'uniswap_v2' | 'uniswap_v3' | 'sushiswap' | 'curve';
  createdAt: Date;
  updatedAt: Date;
}

export interface LiquidityPosition {
  id?: string;
  userAddress: string;
  poolAddress: string;
  token0Amount: string;
  token1Amount: string;
  blockNumber: number;
  timestamp: Date;
  chainId: number;
}

export interface Swap {
  id?: string;
  transactionHash: string;
  poolAddress: string;
  userAddress: string;
  tokenInAddress: string;
  tokenOutAddress: string;
  tokenInAmount: string;
  tokenOutAmount: string;
  blockNumber: number;
  timestamp: Date;
  chainId: number;
}

export interface PriceData {
  id?: string;
  tokenAddress: string;
  price: string;
  priceUSD: string;
  blockNumber: number;
  timestamp: Date;
  chainId: number;
}

export interface ProtocolMetrics {
  id?: string;
  protocol: string;
  chainId: number;
  totalValueLocked: string;
  volume24h: string;
  volume7d: string;
  fees24h: string;
  activeUsers24h: number;
  timestamp: Date;
}

export interface WebSocketMessage {
  type: 'event' | 'price' | 'metrics' | 'error';
  data: any;
  timestamp: Date;
}

export interface IndexingStatus {
  id?: string;
  chainId: number;
  contractAddress: string;
  eventName: string;
  lastBlockNumber: number;
  lastIndexedAt: Date;
  isActive: boolean;
}

export interface OffChainState {
  id?: string;
  key: string;
  value: any;
  updatedAt: Date;
}
