import { createApp } from './app';
import { config } from './config';

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`
  ==============================================================
  🚀 LEDGERFLOW ENTERPRISE SAAS SERVER RUNNING
  ==============================================================
  Instance ID : ${config.instanceId}
  Environment : ${config.env}
  Port        : http://localhost:${config.port}
  Health Check: http://localhost:${config.port}/health
  Static UI   : http://localhost:${config.port}/index.html
  ==============================================================
  `);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server gracefully...');
  server.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });
});
