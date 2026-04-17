import { Router } from 'express';
import { AnalyticsController } from '@/controllers/AnalyticsController';

const router = Router();

router.get('/tokens', AnalyticsController.getTokens);
router.get('/tokens/:address/:chainId', AnalyticsController.getTokenByAddress);
router.get('/pools', AnalyticsController.getPools);
router.get('/pools/:address/:chainId', AnalyticsController.getPoolDetails);
router.get('/swaps', AnalyticsController.getSwaps);
router.get('/metrics/volume', AnalyticsController.getVolumeMetrics);
router.get('/metrics/liquidity', AnalyticsController.getLiquidityMetrics);
router.get('/metrics/top-tokens', AnalyticsController.getTopTokens);

export default router;
