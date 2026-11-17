import mongoose from 'mongoose';
import net from 'node:net';
import { pathToFileURL } from 'node:url';
import app from './app.js';
import { connectDatabase } from './config/db.js';
import { env } from './config/env.js';
import { createRealtimeServer } from './sockets/realtime.js';

async function selectPort(port, allowPortFallback = true, maxAttempts = 20) {
  if (port === 0 || !allowPortFallback) return port;

  for (let candidate = port; candidate < port + maxAttempts; candidate += 1) {
    const isAvailable = await new Promise((resolve) => {
      const tester = net.createServer();
      tester.once('error', () => resolve(false));
      tester.once('listening', () => {
        tester.close(() => resolve(true));
      });
      tester.listen(candidate, '127.0.0.1');
    });

    if (isAvailable) return candidate;
    if (candidate !== port) {
      console.warn(`Port ${candidate - 1} is busy; retrying on ${candidate}.`);
    }
  }

  throw new Error(`No free port available starting from ${port}.`);
}

export async function startServer(options = {}) {
  const { attachShutdownHandlers = true, allowPortFallback = true, port = env.port } = options;
  let shuttingDown = false;

  const shutdown = async (signal, server, realtimeServer) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received. Shutting down gracefully...`);

    try {
      await Promise.allSettled([
        new Promise((resolve) => {
          if (!server) return resolve();
          server.close(() => resolve());
          setTimeout(resolve, 5000);
        }),
        new Promise((resolve) => {
          if (!realtimeServer) return resolve();
          realtimeServer.close(() => resolve());
          setTimeout(resolve, 5000);
        }),
        mongoose.disconnect(),
      ]);
    } finally {
      process.exit(0);
    }
  };

  try {
    await connectDatabase();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`MongoDB unavailable during startup; continuing without a database connection. ${message}`);
  }

  const resolvedPort = await selectPort(port, allowPortFallback);
  const effectivePort = resolvedPort;

  if (effectivePort !== port && port !== 0) {
    console.warn(`Port ${port} is already in use; starting the API on ${effectivePort} instead.`);
  }

  const server = app.listen(effectivePort, () => {
    console.log(`API listening on http://localhost:${effectivePort}`);
  });
  const realtimeServer = createRealtimeServer(server);

  const handleShutdown = (signal) => shutdown(signal, server, realtimeServer);
  if (attachShutdownHandlers) {
    process.on('SIGINT', handleShutdown);
    process.on('SIGTERM', handleShutdown);
  }

  return {
    server,
    realtimeServer,
    cleanup: async () => {
      process.removeListener('SIGINT', handleShutdown);
      process.removeListener('SIGTERM', handleShutdown);
      await Promise.allSettled([
        new Promise((resolve) => {
          realtimeServer.close(() => resolve());
        }),
        new Promise((resolve) => {
          server.close(() => resolve());
        }),
        mongoose.disconnect(),
      ]);
    },
  };
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  startServer().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}
