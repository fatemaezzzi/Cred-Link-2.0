import app from './app';
import { env } from './config/env';

const server = app.listen(env.PORT, () => {
  console.log(`==================================================`);
  console.log(`🚀 CredLink Backend API Server Running`);
  console.log(`Environment : ${env.NODE_ENV}`);
  console.log(`Port        : ${env.PORT}`);
  console.log(`Health Check: http://localhost:${env.PORT}/api/health`);
  console.log(`==================================================`);
});

// Graceful shutdown handling
const shutdown = (signal: string) => {
  console.log(`\nReceived ${signal}. Shutting down Express server gracefully...`);
  server.close(() => {
    console.log('HTTP server closed. Exiting process.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default server;
