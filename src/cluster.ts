import http from 'http';
import { createApp } from './app';
import { config } from './config';

interface BackendNode {
  id: string;
  port: number;
  healthy: boolean;
  serverInstance: http.Server;
}

const instances: BackendNode[] = [];
const ports = config.cluster.ports; // [4001, 4002, 4003]

console.log('Spawning 3 Enterprise SaaS Application Instances...');

ports.forEach((port, idx) => {
  const instanceId = `server-${idx + 1}`;
  const app = createApp(instanceId);

  const srv = app.listen(port, '0.0.0.0', () => {
    console.log(`  [OK] ${instanceId} listening on http://localhost:${port}`);
  });

  instances.push({
    id: instanceId,
    port,
    healthy: true,
    serverInstance: srv
  });
});

// Periodic Health Checker
setInterval(() => {
  instances.forEach((inst) => {
    const req = http.get(`http://127.0.0.1:${inst.port}/health`, (res) => {
      inst.healthy = res.statusCode === 200;
      res.resume(); // Free socket buffer
    });
    req.on('error', () => {
      inst.healthy = false;
    });
    req.setTimeout(2500, () => {
      req.destroy();
    });
  });
}, 4000);

// Round-Robin Load Balancer on Port 4000
let rrIndex = 0;

const loadBalancer = http.createServer((clientReq, clientRes) => {
  let healthyNodes = instances.filter((n) => n.healthy);
  if (healthyNodes.length === 0) {
    healthyNodes = instances; // Fail-safe fallback to available instances
  }

  // Select next node via Round-Robin
  const targetNode = healthyNodes[rrIndex % healthyNodes.length];
  rrIndex++;

  const proxyOptions = {
    hostname: '127.0.0.1',
    port: targetNode.port,
    path: clientReq.url,
    method: clientReq.method,
    headers: {
      ...clientReq.headers,
      'x-forwarded-for': clientReq.socket.remoteAddress || '127.0.0.1',
      'x-forwarded-proto': 'http',
      'x-served-by': targetNode.id
    }
  };

  const proxyReq = http.request(proxyOptions, (proxyRes) => {
    clientRes.writeHead(proxyRes.statusCode || 200, {
      ...proxyRes.headers,
      'x-served-by': targetNode.id,
      'x-load-balancer': 'LedgerFlow-MultiServer-LB'
    });
    proxyRes.pipe(clientRes);
  });

  proxyReq.on('error', (err) => {
    console.error(`[LB ERROR] Failed to proxy to ${targetNode.id}:${targetNode.port}:`, err.message);
    targetNode.healthy = false;
    clientRes.writeHead(502, { 'Content-Type': 'application/json' });
    clientRes.end(JSON.stringify({ error: 'BAD_GATEWAY', message: 'Target instance failed to respond.' }));
  });

  clientReq.pipe(proxyReq);
});

loadBalancer.listen(config.cluster.lbPort, () => {
  console.log(`
  ==============================================================
  ⚖️ LEDGERFLOW 3-SERVER LOAD BALANCER ACTIVE
  ==============================================================
  Load Balancer (Port ${config.cluster.lbPort}): http://localhost:${config.cluster.lbPort}
  Backend Cluster:
    1. Server 1 -> http://localhost:4001 [Healthy]
    2. Server 2 -> http://localhost:4002 [Healthy]
    3. Server 3 -> http://localhost:4003 [Healthy]
  Algorithm    : Round-Robin with Dynamic Health Checking
  Shared State : Centralized Persistent Multi-Tenant Repository
  ==============================================================
  `);
});
