import app from './app.js';

const PORT = process.env.PORT || 3000;

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT_EXCEPTION]', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED_REJECTION]', reason);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Ticketflow Backend] Express server running at http://localhost:${PORT}`);
  console.log(`[Ticketflow Backend] API available at http://localhost:${PORT}/api`);
});
