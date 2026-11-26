import http from 'http';

const TARGET = process.env.TARGET_URL || 'http://127.0.0.1:4000';
const CONCURRENCY = parseInt(process.env.LOAD_CONCURRENCY || '150', 10);
const TOTAL_REQUESTS = parseInt(process.env.LOAD_REQUESTS || '3000', 10);

const agent = new http.Agent({ keepAlive: true, maxSockets: CONCURRENCY });

function requestOnce(path: string, method = 'GET', headers: Record<string, string> = {}, body?: string) {
  return new Promise<{ status: number; latencyMs: number; servedBy: string }>((resolve) => {
    const start = performance.now();
    const url = new URL(path, TARGET);
    const req = http.request(
      url,
      { method, agent, headers },
      (res) => {
        res.resume();
        res.on('end', () => {
          resolve({
            status: res.statusCode || 0,
            latencyMs: performance.now() - start,
            servedBy: String(res.headers['x-served-by'] || 'standalone'),
          });
        });
      }
    );
    req.on('error', () => {
      resolve({ status: 0, latencyMs: performance.now() - start, servedBy: 'error' });
    });
    if (body) req.write(body);
    req.end();
  });
}

async function loginDemo(): Promise<string | null> {
  return new Promise((resolve) => {
    const url = new URL('/api/auth/login', TARGET);
    const payload = JSON.stringify({ email: 'alex@ledgerflow.app', password: '123456' });
    const req = http.request(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(raw);
            resolve(parsed?.data?.accessToken || null);
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on('error', () => resolve(null));
    req.write(payload);
    req.end();
  });
}

async function run() {
  console.log(`\nStarting LedgerFlow Cluster Load Benchmark -> ${TARGET}`);
  console.log(`Concurrency: ${CONCURRENCY} workers | Total Requests: ${TOTAL_REQUESTS}\n`);

  const token = await loginDemo();
  const authHeaders: Record<string, string> = token
    ? { Authorization: `Bearer ${token}`, 'X-Organization-ID': 'org-alex-wealth-01' }
    : {};

  const latencies: number[] = [];
  const nodeCounts: Record<string, number> = {};
  let okCount = 0;
  let errCount = 0;
  let issued = 0;

  const tStart = performance.now();

  async function worker() {
    while (true) {
      const idx = issued++;
      if (idx >= TOTAL_REQUESTS) break;
      const endpoint = idx % 3 === 0 ? '/health' : idx % 3 === 1 ? '/utcp-manual.json' : '/api/transactions?limit=20';
      const hdrs = endpoint.startsWith('/api/') ? authHeaders : {};
      const res = await requestOnce(endpoint, 'GET', hdrs);
      latencies.push(res.latencyMs);
      nodeCounts[res.servedBy] = (nodeCounts[res.servedBy] || 0) + 1;
      if (res.status >= 200 && res.status < 400) okCount++;
      else errCount++;
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  const totalMs = performance.now() - tStart;

  latencies.sort((a, b) => a - b);
  const pct = (p: number) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))] || 0;
  const rps = Math.round((TOTAL_REQUESTS / (totalMs / 1000)) * 10) / 10;

  console.log('=== BENCHMARK RESULTS ===');
  console.log(`Total Duration : ${(totalMs / 1000).toFixed(2)}s`);
  console.log(`Throughput     : ${rps} req/sec`);
  console.log(`Success / Fail : ${okCount} / ${errCount}`);
  console.log(`Latency p50    : ${pct(0.5).toFixed(2)}ms`);
  console.log(`Latency p95    : ${pct(0.95).toFixed(2)}ms`);
  console.log(`Latency p99    : ${pct(0.99).toFixed(2)}ms`);
  console.log(`Node Balance   :`, nodeCounts);
  agent.destroy();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
