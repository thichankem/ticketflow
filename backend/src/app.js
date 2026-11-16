import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import apiRouter from './routes/index.js';
import { sanitizerMiddleware } from './middleware/sanitizer.middleware.js';
import { centralizedErrorHandler } from './middleware/error.middleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, '../../frontend/dist');

const app = express();

// Trust proxy for rate limiting behind reverse proxies / Vercel
app.set('trust proxy', 1);

// CORS configuration with strict domain allowlist (SEC-03 remediation)
const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:5175',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174',
      'http://127.0.0.1:5175',
    ];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-order-token',
    'x-signature',
    'x-webhook-signature',
    'x-queue-token',
    'x-waiting-room-token',
    'x-admission-token',
  ],
}));

// Body & Cookie Parsers with extended payload limit for optimized image uploads
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(cookieParser());

// DOMPurify XSS input sanitizer
app.use(sanitizerMiddleware);

// Mount API routes (supports both /api/* and direct serverless rewrites)
app.use('/api', apiRouter);

// Serve static compiled frontend assets if available locally
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || path.extname(req.path)) {
      return next();
    }
    const indexHtmlPath = path.join(distPath, 'index.html');
    res.sendFile(indexHtmlPath, (err) => {
      if (err) {
        next();
      }
    });
  });
}

// Centralized Error Handling
app.use(centralizedErrorHandler);

export default app;
