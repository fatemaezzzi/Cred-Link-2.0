import app from './app.js';
import { env } from './config/env.js';
import { initIssuerAgent } from './veramo/issuer.js';

async function startServer() {
  try {
    // Initialize persistent NIT Veramo issuer & canary check
    await initIssuerAgent();

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
  } catch (err: any) {
    console.error('[FATAL] Failed to initialize server:', err.message);
    process.exit(1);
  }
}

startServer();

export default app;
