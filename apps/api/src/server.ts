import 'dotenv/config';
import { createServer } from 'node:http';
import mongoose from 'mongoose';
import { createApp } from './app.js';
import { parseEnvironment } from './config.js';

async function start() {
  const config = parseEnvironment(process.env);
  mongoose.set('bufferCommands', false);
  await mongoose.connect(config.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
  });
  const server = createServer(
    createApp(() => mongoose.connection.readyState === 1),
  );
  let stopping = false;

  const shutdown = (exitCode: number) => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => process.exit(1), 10000);
    deadline.unref();
    server.close(() => {
      void mongoose
        .disconnect()
        .then(() => {
          clearTimeout(deadline);
          process.exit(exitCode);
        })
        .catch(() => process.exit(1));
    });
  };
  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));
  server.on('error', () => {
    console.error('API listener failed. Check HOST and PORT.');
    shutdown(1);
  });
  server.listen(config.PORT, config.HOST, () => {
    console.info(
      `Monivo API listening at http://${config.HOST}:${config.PORT}`,
    );
  });
}

start().catch(async () => {
  console.error(
    'API startup failed. Check environment variables and MongoDB availability.',
  );
  await mongoose.disconnect();
  process.exitCode = 1;
});
