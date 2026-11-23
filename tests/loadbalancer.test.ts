import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createApp } from '../src/app';

describe('Three-Server Load Balancing & High Availability Architecture', () => {
  let srv1: http.Server;
  let srv2: http.Server;
  let srv3: http.Server;
  let lbServer: http.Server;
  const nodes = [
    { id: 'server-1', port: 4011, healthy: true },
    { id: 'server-2', port: 4012, healthy: true },
    { id: 'server-3', port: 4013, healthy: true }
  ];

  beforeAll(async () => {
    // Spin up 3 backend test instances
    const app1 = createApp();
    const app2 = createApp();
    const app3 = createApp();

    await new Promise<void>((resolve) => { srv1 = app1.listen(4011, () => resolve()); });
    await new Promise<void>((resolve) => { srv2 = app2.listen(4012, () => resolve()); });
    await new Promise<void>((resolve) => { srv3 = app3.listen(4013, () => resolve()); });

    // Spin up mini load balancer on port 4010
    let rr = 0;
    lbServer = http.createServer((req, res) => {
      const healthyNodes = nodes.filter((n) => n.healthy);
      const target = healthyNodes[rr % healthyNodes.length];
      rr++;

      const pReq = http.request({
        hostname: '127.0.0.1',
        port: target.port,
        path: req.url,
        method: req.method,
        headers: req.headers
      }, (pRes) => {
        res.writeHead(pRes.statusCode || 200, {
          ...pRes.headers,
          'x-served-by': target.id
        });
        pRes.pipe(res);
      });
      req.pipe(pReq);
    });

    await new Promise<void>((resolve) => { lbServer.listen(4010, () => resolve()); });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => srv1.close(() => resolve()));
    await new Promise<void>((resolve) => srv2.close(() => resolve()));
    await new Promise<void>((resolve) => srv3.close(() => resolve()));
    await new Promise<void>((resolve) => lbServer.close(() => resolve()));
  });

  it('cycles requests in round-robin fashion across Server 1, Server 2, and Server 3', async () => {
    const hits: string[] = [];

    for (let i = 0; i < 6; i++) {
      const serverName = await new Promise<string>((resolve, reject) => {
        http.get('http://127.0.0.1:4010/health', (res) => {
          resolve((res.headers['x-served-by'] as string) || '');
        }).on('error', reject);
      });
      hits.push(serverName);
    }

    expect(hits).toEqual(['server-1', 'server-2', 'server-3', 'server-1', 'server-2', 'server-3']);
  });

  it('automatically routes traffic around an unhealthy instance during node failure', async () => {
    // Mark Server 2 as unhealthy
    nodes[1].healthy = false;

    const failoverHits: string[] = [];
    for (let i = 0; i < 4; i++) {
      const serverName = await new Promise<string>((resolve, reject) => {
        http.get('http://127.0.0.1:4010/health', (res) => {
          resolve((res.headers['x-served-by'] as string) || '');
        }).on('error', reject);
      });
      failoverHits.push(serverName);
    }

    // Must only hit server-1 and server-3
    expect(failoverHits).not.toContain('server-2');
    expect(failoverHits).toEqual(['server-1', 'server-3', 'server-1', 'server-3']);
  });
});
