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

// CORS configuration supporting credentials
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body & Cookie Parsers
app.use(express.json());
app.use(cookieParser());

// DOMPurify XSS input sanitizer
app.use(sanitizerMiddleware);

// Mount API routes (supports both /api/* and direct serverless rewrites)
app.use('/api', apiRouter);

// Serve static compiled frontend assets if available locally
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));

  app.get(['/', '/events*', '/checkout*', '/admin*', '/login*', '/register*'], (req, res, next) => {
    if (req.path.startsWith('/api')) {
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
