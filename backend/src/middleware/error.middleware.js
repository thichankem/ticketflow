export const centralizedErrorHandler = (err, req, res, next) => {
  console.error('[API Error]', err);

  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    error: err.name || 'Error',
    message,
    ...(err.code && { code: err.code }),
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
};

export default centralizedErrorHandler;
