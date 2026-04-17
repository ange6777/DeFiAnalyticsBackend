import rateLimit from 'express-rate-limit';
import { config } from '@/config';

export const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const analyticsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many analytics requests, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const websocketLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // limit each IP to 10 WebSocket connections per minute
  message: {
    error: 'Too many WebSocket connection attempts, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
