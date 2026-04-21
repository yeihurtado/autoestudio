import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const echoLatency = new Trend('echo_latency', true);
const businessErrors = new Counter('business_errors');

export const options = {
  stages: [
    { duration: '10s', target: 2 },
    { duration: '20s', target: 2 },
    { duration: '5s',  target: 0 },
  ],
  tags: {
    test_type: 'smoke',
    environment: 'local',
  },
  thresholds: {
    'http_req_duration': ['p(95)<500', 'p(99)<1000'],
    'http_req_failed':   ['rate<0.01'],
    'checks':            ['rate>0.99'],
    'echo_latency':      ['p(95)<300'],
    'http_req_duration{endpoint:fast}': ['p(95)<50'],
    'http_req_duration{endpoint:slow}': ['p(95)<400'],
  },
};

export function setup() {
  console.log(`[setup] BASE_URL = ${BASE_URL}`);
  const res = http.get(`${BASE_URL}/health`);
  if (res.status !== 200) {
    throw new Error(`SUT no responde en /health (status=${res.status})`);
  }
  return { startedAt: new Date().toISOString() };
}

export default function () {
  group('GET /fast', () => {
    const res = http.get(`${BASE_URL}/fast`, { tags: { endpoint: 'fast' } });
    check(res, {
      'fast status 200':  (r) => r.status === 200,
      'fast endpoint ok': (r) => r.json('endpoint') === 'fast',
    });
  });

  group('GET /slow', () => {
    const res = http.get(`${BASE_URL}/slow?ms=150`, { tags: { endpoint: 'slow' } });
    check(res, {
      'slow status 200':      (r) => r.status === 200,
      'slow delay reportado': (r) => r.json('delay_ms') === 150,
    });
  });

  group('POST /echo', () => {
    const payload = JSON.stringify({ message: 'hola k6', user_id: __VU });
    const params = {
      headers: { 'Content-Type': 'application/json' },
      tags: { endpoint: 'echo' },
    };
    const res = http.post(`${BASE_URL}/echo`, payload, params);
    const ok = check(res, {
      'echo status 200':       (r) => r.status === 200,
      'echo message correcto': (r) => r.json('received.message') === 'hola k6',
    });
    if (!ok) businessErrors.add(1);
    echoLatency.add(res.timings.duration);
  });

  sleep(1);
}

export function teardown(data) {
  console.log(`[teardown] test iniciado en ${data.startedAt}`);
}
