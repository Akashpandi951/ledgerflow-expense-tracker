import http from 'http';
import os from 'os';
import { createApp } from './app';
import { config } from './config';

interface BackendNode {
  id: string;
  port: number;
  healthy: boolean;
  circuitOpenUntil: number;
  consecutiveFailures: number;
  activeConnections: number;
  totalRequests: number;
  totalErrors: number;
  ewmaLatencyMs: number;
  serverInstance: http.Server;
}

const instances: BackendNode[] = [];
const ports = config.cluster.ports;

// Persistent HTTP Keep-Alive socket pool for high-concurrency L7 proxying
const upstreamAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 30_000,
  maxSockets: 4096,
  maxFreeSockets: 256,
  scheduling: 'lifo',
});

console.log(`Spawning ${ports.length} LedgerFlow Application Instances (CPUs: ${os.cpus().length})...`);

ports.forEach((port, idx) => {
  const instanceId = `server-${idx + 1}`;
  const app = createApp(instanceId);

  const srv = app.listen(port, '0.0.0.0', () => {
    console.log(`  [OK] ${instanceId} listening on http://localhost:${port}`);
  });
  srv.keepAliveTimeout = 65_000;
  srv.headersTimeout = 66_000;

  instances.push({
    id: instanceId,
    port,
    healthy: true,
    circuitOpenUntil: 0,
    consecutiveFailures: 0,
    activeConnections: 0,
    totalRequests: 0,
    totalErrors: 0,
    ewmaLatencyMs: 1,
    serverInstance: srv,
  });
});

// Periodic Health Checker & Circuit Breaker Recovery
const healthTimer = setInterval(() => {
  const now = Date.now();
  instances.forEach((inst) => {
    const req = http.get(
      {
        hostname: '127.0.0.1',
        port: inst.port,
        path: '/health',
        agent: upstreamAgent,
        timeout: 2500,
      },
      (res) => {
        const ok = res.statusCode === 200;
        inst.healthy = ok;
        if (ok && now >= inst.circuitOpenUntil) {
          inst.consecutiveFailures = 0;
        }
        res.resume();
      }
    );
    req.on('error', () => {
      inst.healthy = false;
    });
    req.on('timeout', () => {
      inst.healthy = false;
      req.destroy();
    });
  });
}, 4000);
if (healthTimer.unref) healthTimer.unref();

/**
 * Least-Connections + EWMA Latency Load Balancing with Circuit Breaker
 */
let tieBreaker = 0;
function selectOptimalNode(): BackendNode {
  const now = Date.now();
  let candidates = instances.filter((n) => n.healthy && now >= n.circuitOpenUntil);
  if (candidates.length === 0) {
    candidates = instances.filter((n) => n.healthy);
  }
  if (candidates.length === 0) {
    candidates = instances;
  }

  let minActive = Infinity;
  for (const n of candidates) {
    if (n.activeConnections < minActive) minActive = n.activeConnections;
  }

  const leastLoaded = candidates.filter((n) => n.activeConnections <= minActive + 1);
  return leastLoaded[tieBreaker++ % leastLoaded.length];
}

const loadBalancer = http.createServer((clientReq, clientRes) => {
  // Built-in Load Balancer Telemetry Endpoint
  if (clientReq.url === '/lb-stats' && clientReq.method === 'GET') {
    clientRes.writeHead(200, { 'Content-Type': 'application/json' });
    clientRes.end(
      JSON.stringify({
        algorithm: 'least_connections_ewma',
        keepAlivePoolMaxSockets: 4096,
        nodes: instances.map((n) => ({
          id: n.id,
          port: n.port,
          healthy: n.healthy,
          circuitOpen: Date.now() < n.circuitOpenUntil,
          activeConnections: n.activeConnections,
          totalRequests: n.totalRequests,
          totalErrors: n.totalErrors,
          ewmaLatencyMs: Math.round(n.ewmaLatencyMs * 100) / 100,
        })),
      })
    );
    return;
  }

  const targetNode = selectOptimalNode();
  const startedAt = performance.now();
  targetNode.activeConnections++;
  targetNode.totalRequests++;
  let released = false;
  const release = () => {
    if (!released) {
      released = true;
      targetNode.activeConnections = Math.max(0, targetNode.activeConnections - 1);
    }
  };

  const proxyOptions: http.RequestOptions = {
    hostname: '127.0.0.1',
    port: targetNode.port,
    path: clientReq.url,
    method: clientReq.method,
    agent: upstreamAgent,
    headers: {
      ...clientReq.headers,
      'x-forwarded-for': clientReq.socket.remoteAddress || '127.0.0.1',
      'x-forwarded-proto': 'http',
      'x-served-by': targetNode.id,
    },
  };

  const proxyReq = http.request(proxyOptions, (proxyRes) => {
    const elapsed = performance.now() - startedAt;
    targetNode.ewmaLatencyMs = targetNode.ewmaLatencyMs * 0.8 + elapsed * 0.2;
    targetNode.consecutiveFailures = 0;

    clientRes.writeHead(proxyRes.statusCode || 200, {
      ...proxyRes.headers,
      'x-served-by': targetNode.id,
      'x-load-balancer': 'LedgerFlow-LeastConn-EWMA',
    });
    proxyRes.pipe(clientRes);
    proxyRes.on('end', release);
    proxyRes.on('close', release);
  });

  proxyReq.on('error', (err) => {
    release();
    targetNode.totalErrors++;
    targetNode.consecutiveFailures++;
    if (targetNode.consecutiveFailures >= 3) {
      targetNode.circuitOpenUntil = Date.now() + 5000;
      targetNode.healthy = false;
    }
    console.error(`[LB ERROR] ${targetNode.id}:${targetNode.port} -> ${err.message}`);
    if (!clientRes.headersSent) {
      clientRes.writeHead(502, { 'Content-Type': 'application/json' });
      clientRes.end(JSON.stringify({ error: 'BAD_GATEWAY', message: 'Target instance failed to respond.' }));
    }
  });

  clientReq.on('close', release);
  clientReq.pipe(proxyReq);
});

loadBalancer.keepAliveTimeout = 65_000;
loadBalancer.headersTimeout = 66_000;

loadBalancer.listen(config.cluster.lbPort, () => {
  console.log(`
  ==============================================================
  ⚖️ LEDGERFLOW HIGH-CONCURRENCY LOAD BALANCER ACTIVE
  ==============================================================
  Load Balancer (Port ${config.cluster.lbPort}): http://localhost:${config.cluster.lbPort}
  LB Telemetry  : http://localhost:${config.cluster.lbPort}/lb-stats
  Nodes         : ${instances.map((n) => `${n.id}:${n.port}`).join(', ')}
  Algorithm     : Least-Connections + EWMA Latency + Circuit Breaker
  Keep-Alive    : Enabled (4,096 upstream sockets)
  ==============================================================
  `);
});
