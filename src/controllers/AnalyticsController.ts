import { Request, Response } from 'express';
import { TokenModel } from '@/models/Token';
import db from '@/config/database';

export class AnalyticsController {
  static async getTokens(req: Request, res: Response): Promise<void> {
    try {
      const { chainId, page = 1, limit = 50 } = req.query;
      
      const offset = (Number(page) - 1) * Number(limit);
      let query = db('tokens').orderBy('created_at', 'desc');
      
      if (chainId) {
        query = query.where('chain_id', Number(chainId));
      }
      
      const tokens = await query.limit(Number(limit)).offset(offset);
      const total = await db('tokens').where(chainId ? { chain_id: Number(chainId) } : {}).count('* as count');
      
      res.json({
        data: tokens.map((token: any) => ({
          id: token.id,
          address: token.address,
          symbol: token.symbol,
          name: token.name,
          decimals: token.decimals,
          chainId: token.chain_id,
          totalSupply: token.total_supply,
          createdAt: token.created_at,
          updatedAt: token.updated_at,
        })),
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: Number(total[0].count),
          totalPages: Math.ceil(Number(total[0].count) / Number(limit)),
        },
      });
    } catch (error) {
      console.error('Error fetching tokens:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getTokenByAddress(req: Request, res: Response): Promise<void> {
    try {
      const { address, chainId } = req.params;
      
      const token = await TokenModel.findByAddress(address, Number(chainId));
      
      if (!token) {
        res.status(404).json({ error: 'Token not found' });
        return;
      }
      
      res.json({ data: token });
    } catch (error) {
      console.error('Error fetching token:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getPools(req: Request, res: Response): Promise<void> {
    try {
      const { chainId, protocol, page = 1, limit = 50 } = req.query;
      
      const offset = (Number(page) - 1) * Number(limit);
      let query = db('pools').orderBy('created_at', 'desc');
      
      if (chainId) {
        query = query.where('chain_id', Number(chainId));
      }
      
      if (protocol) {
        query = query.where('protocol', protocol);
      }
      
      const pools = await query.limit(Number(limit)).offset(offset);
      const total = await db('pools')
        .where(chainId ? { chain_id: Number(chainId) } : {})
        .where(protocol ? { protocol } : {})
        .count('* as count');
      
      res.json({
        data: pools.map((pool: any) => ({
          id: pool.id,
          address: pool.address,
          token0Address: pool.token0_address,
          token1Address: pool.token1_address,
          token0Symbol: pool.token0_symbol,
          token1Symbol: pool.token1_symbol,
          fee: pool.fee,
          chainId: pool.chain_id,
          protocol: pool.protocol,
          createdAt: pool.created_at,
          updatedAt: pool.updated_at,
        })),
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: Number(total[0].count),
          totalPages: Math.ceil(Number(total[0].count) / Number(limit)),
        },
      });
    } catch (error) {
      console.error('Error fetching pools:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getSwaps(req: Request, res: Response): Promise<void> {
    try {
      const { 
        chainId, 
        poolAddress, 
        userAddress, 
        fromTime, 
        toTime, 
        page = 1, 
        limit = 50 
      } = req.query;
      
      const offset = (Number(page) - 1) * Number(limit);
      let query = db('swaps').orderBy('timestamp', 'desc');
      
      if (chainId) {
        query = query.where('chain_id', Number(chainId));
      }
      
      if (poolAddress) {
        query = query.where('pool_address', poolAddress);
      }
      
      if (userAddress) {
        query = query.where('user_address', userAddress);
      }
      
      if (fromTime) {
        query = query.where('timestamp', '>=', new Date(fromTime as string));
      }
      
      if (toTime) {
        query = query.where('timestamp', '<=', new Date(toTime as string));
      }
      
      const swaps = await query.limit(Number(limit)).offset(offset);
      
      let countQuery = db('swaps');
      if (chainId) countQuery = countQuery.where('chain_id', Number(chainId));
      if (poolAddress) countQuery = countQuery.where('pool_address', poolAddress);
      if (userAddress) countQuery = countQuery.where('user_address', userAddress);
      if (fromTime) countQuery = countQuery.where('timestamp', '>=', new Date(fromTime as string));
      if (toTime) countQuery = countQuery.where('timestamp', '<=', new Date(toTime as string));
      
      const total = await countQuery.count('* as count');
      
      res.json({
        data: swaps.map((swap: any) => ({
          id: swap.id,
          transactionHash: swap.transaction_hash,
          poolAddress: swap.pool_address,
          userAddress: swap.user_address,
          tokenInAddress: swap.token_in_address,
          tokenOutAddress: swap.token_out_address,
          tokenInAmount: swap.token_in_amount,
          tokenOutAmount: swap.token_out_amount,
          blockNumber: swap.block_number,
          timestamp: swap.timestamp,
          chainId: swap.chain_id,
        })),
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: Number(total[0].count),
          totalPages: Math.ceil(Number(total[0].count) / Number(limit)),
        },
      });
    } catch (error) {
      console.error('Error fetching swaps:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getVolumeMetrics(req: Request, res: Response): Promise<void> {
    try {
      const { chainId, poolAddress, timeRange = '24h' } = req.query;
      
      let timeFilter = '';
      const now = new Date();
      
      switch (timeRange) {
        case '1h':
          timeFilter = `timestamp >= NOW() - INTERVAL '1 hour'`;
          break;
        case '24h':
          timeFilter = `timestamp >= NOW() - INTERVAL '24 hours'`;
          break;
        case '7d':
          timeFilter = `timestamp >= NOW() - INTERVAL '7 days'`;
          break;
        case '30d':
          timeFilter = `timestamp >= NOW() - INTERVAL '30 days'`;
          break;
        default:
          timeFilter = `timestamp >= NOW() - INTERVAL '24 hours'`;
      }
      
      let whereClause = timeFilter;
      if (chainId) {
        whereClause += ` AND chain_id = ${Number(chainId)}`;
      }
      if (poolAddress) {
        whereClause += ` AND pool_address = '${poolAddress}'`;
      }
      
      const volumeQuery = `
        SELECT 
          COUNT(*) as transaction_count,
          SUM(CAST(token_in_amount AS DECIMAL(36, 18))) as total_volume_in,
          SUM(CAST(token_out_amount AS DECIMAL(36, 18))) as total_volume_out,
          AVG(CAST(token_in_amount AS DECIMAL(36, 18))) as avg_trade_size,
          MAX(CAST(token_in_amount AS DECIMAL(36, 18))) as largest_trade
        FROM swaps 
        WHERE ${whereClause}
      `;
      
      const metrics = await db.raw(volumeQuery);
      
      res.json({
        data: {
          timeRange,
          transactionCount: Number(metrics.rows[0].transaction_count),
          totalVolumeIn: metrics.rows[0].total_volume_in,
          totalVolumeOut: metrics.rows[0].total_volume_out,
          averageTradeSize: metrics.rows[0].avg_trade_size,
          largestTrade: metrics.rows[0].largest_trade,
        },
      });
    } catch (error) {
      console.error('Error fetching volume metrics:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getLiquidityMetrics(req: Request, res: Response): Promise<void> {
    try {
      const { chainId, protocol } = req.query;
      
      let whereClause = '1=1';
      if (chainId) {
        whereClause += ` AND chain_id = ${Number(chainId)}`;
      }
      if (protocol) {
        whereClause += ` AND protocol = '${protocol}'`;
      }
      
      const liquidityQuery = `
        SELECT 
          COUNT(*) as pool_count,
          protocol,
          chain_id,
          SUM(COALESCE(CAST(reserve0 AS DECIMAL(36, 18)), 0)) as total_reserve0,
          SUM(COALESCE(CAST(reserve1 AS DECIMAL(36, 18)), 0)) as total_reserve1
        FROM pools 
        WHERE ${whereClause}
        GROUP BY protocol, chain_id
      `;
      
      const metrics = await db.raw(liquidityQuery);
      
      res.json({
        data: metrics.rows.map((row: any) => ({
          poolCount: Number(row.pool_count),
          protocol: row.protocol,
          chainId: row.chain_id,
          totalReserve0: row.total_reserve0,
          totalReserve1: row.total_reserve1,
        })),
      });
    } catch (error) {
      console.error('Error fetching liquidity metrics:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getTopTokens(req: Request, res: Response): Promise<void> {
    try {
      const { chainId, limit = 10 } = req.query;
      
      let whereClause = '1=1';
      if (chainId) {
        whereClause += ` AND s.chain_id = ${Number(chainId)}`;
      }
      
      const topTokensQuery = `
        SELECT 
          t.address,
          t.symbol,
          t.name,
          t.chain_id,
          COUNT(*) as swap_count,
          SUM(CAST(s.token_in_amount AS DECIMAL(36, 18))) as total_volume,
          MAX(s.timestamp) as last_swap_time
        FROM tokens t
        INNER JOIN swaps s ON (
          t.address = s.token_in_address OR t.address = s.token_out_address
        ) AND t.chain_id = s.chain_id
        WHERE ${whereClause}
          AND s.timestamp >= NOW() - INTERVAL '24 hours'
        GROUP BY t.address, t.symbol, t.name, t.chain_id
        ORDER BY total_volume DESC
        LIMIT ${Number(limit)}
      `;
      
      const topTokens = await db.raw(topTokensQuery);
      
      res.json({
        data: topTokens.rows.map((row: any) => ({
          address: row.address,
          symbol: row.symbol,
          name: row.name,
          chainId: row.chain_id,
          swapCount: Number(row.swap_count),
          totalVolume: row.total_volume,
          lastSwapTime: row.last_swap_time,
        })),
      });
    } catch (error) {
      console.error('Error fetching top tokens:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getPoolDetails(req: Request, res: Response): Promise<void> {
    try {
      const { address, chainId } = req.params;
      
      const pool = await db('pools')
        .where({ address, chain_id: Number(chainId) })
        .first();
      
      if (!pool) {
        res.status(404).json({ error: 'Pool not found' });
        return;
      }
      
      const volumeQuery = `
        SELECT 
          COUNT(*) as swap_count_24h,
          SUM(CAST(token_in_amount AS DECIMAL(36, 18))) as volume_24h,
          MAX(timestamp) as last_swap_time
        FROM swaps 
        WHERE pool_address = '${address}' 
          AND chain_id = ${Number(chainId)}
          AND timestamp >= NOW() - INTERVAL '24 hours'
      `;
      
      const volumeMetrics = await db.raw(volumeQuery);
      
      res.json({
        data: {
          id: pool.id,
          address: pool.address,
          token0Address: pool.token0_address,
          token1Address: pool.token1_address,
          token0Symbol: pool.token0_symbol,
          token1Symbol: pool.token1_symbol,
          fee: pool.fee,
          chainId: pool.chain_id,
          protocol: pool.protocol,
          reserve0: pool.reserve0,
          reserve1: pool.reserve1,
          swapCount24h: Number(volumeMetrics.rows[0].swap_count_24h),
          volume24h: volumeMetrics.rows[0].volume_24h,
          lastSwapTime: volumeMetrics.rows[0].last_swap_time,
          createdAt: pool.created_at,
          updatedAt: pool.updated_at,
        },
      });
    } catch (error) {
      console.error('Error fetching pool details:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
