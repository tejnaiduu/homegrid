import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

export function notFoundHandler(req, _res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

// Keep API errors in one predictable response shape.
export function errorHandler(error, _req, res, _next) {
  let statusCode = error.statusCode || 500;
  let message = error.message || 'Internal server error.';
  let details = error.details;

  if (error.name === 'ValidationError') {
    statusCode = 400;
    message = 'Please check the submitted data.';
    details = Object.values(error.errors).map((item) => item.message);
  } else if (error.name === 'CastError') {
    statusCode = 400;
    message = 'The supplied identifier is invalid.';
  } else if (error.code === 11000) {
    statusCode = 409;
    message = 'A record with this value already exists.';
    details = error.keyValue;
  }

  if (env.nodeEnv !== 'production' && statusCode >= 500) {
    console.error(error);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(details ? { details } : {}),
    ...(env.nodeEnv !== 'production' && statusCode >= 500 ? { stack: error.stack } : {}),
  });
}
