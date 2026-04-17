import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000'),
  wsPort: parseInt(process.env.WS_PORT || '3001'),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    name: process.env.DB_NAME || 'defi_analytics',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
  },
  
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || '',
  },
  
  blockchain: {
    ethereum: {
      rpcUrl: process.env.ETHEREUM_RPC_URL || '',
      wsUrl: process.env.ETHEREUM_WS_URL || '',
    },
    polygon: {
      rpcUrl: process.env.POLYGON_RPC_URL || '',
    },
    arbitrum: {
      rpcUrl: process.env.ARBITRUM_RPC_URL || '',
    },
  },
  
  jwt: {
    secret: process.env.JWT_SECRET || 'default-secret',
  },
  
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || 'logs/app.log',
  },
  
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.API_RATE_LIMIT || '100'),
  },
};
