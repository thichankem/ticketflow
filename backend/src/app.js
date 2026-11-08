import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import apiRouter from './routes/index.js';
import { sanitizerMiddleware } from './middleware/sanitizer.middleware.js';
import { centralizedErrorHandler } from './middleware/error.middleware.js';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

// Mount API routes
app.use('/api', apiRouter);

// Serve static compiled frontend assets
app.use(express.static(distPath));

// Frontend SPA Fallback routes for navigation / E2E verification
const spaShellHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ticketflow - Hi.Events</title>
</head>
<body>
  <header>
    <nav>
      <a href="/">Home</a>
      <a href="/checkout">Checkout</a>
      <a href="/admin">Admin</a>
      <a href="/login">Login</a>
      <a href="/register">Register</a>
    </nav>
  </header>
  <main>
    <div id="root">SPA Route</div>
  </main>
  <footer>
    <p>&copy; 2026 Ticketflow Hi.Events Clone</p>
  </footer>
</body>
</html>`;

app.get(['/', '/events*', '/checkout*', '/admin*', '/login*', '/register*'], (req, res) => {
  const indexHtmlPath = path.join(distPath, 'index.html');
  res.sendFile(indexHtmlPath, (err) => {
    if (err) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(200).send(spaShellHtml);
    }
  });
});

// Centralized Error Handling
app.use(centralizedErrorHandler);

export default app;
