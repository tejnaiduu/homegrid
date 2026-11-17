import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';

const { startServer } = await import('../src/server.js');

test('server startup falls back to a free port when the requested port is occupied', async () => {
  const blocker = net.createServer();
  const occupiedPort = await new Promise((resolve) => {
    blocker.listen(0, '127.0.0.1', () => resolve(blocker.address().port));
  });

  try {
    const { server, cleanup } = await startServer({ attachShutdownHandlers: false, port: occupiedPort });
    assert.notEqual(server.address().port, occupiedPort);
    await cleanup();
  } finally {
    await new Promise((resolve, reject) => blocker.close((error) => error ? reject(error) : resolve()));
  }
});

test('server startup registers shutdown handlers and closes sockets gracefully', async () => {
  const originalExit = process.exit;
  const originalOn = process.on;
  const originalOff = process.removeListener;
  const calls = [];

  process.exit = () => { calls.push('exit'); };
  process.on = (event, handler) => {
    calls.push(event);
    return process;
  };
  process.removeListener = (event, handler) => {
    calls.push(`remove:${event}`);
    return process;
  };

  try {
    const { cleanup } = await startServer({ attachShutdownHandlers: true, port: 0 });
    assert.ok(calls.includes('SIGINT'));
    assert.ok(calls.includes('SIGTERM'));
    await cleanup();
  } finally {
    process.exit = originalExit;
    process.on = originalOn;
    process.removeListener = originalOff;
  }
});
