  import http from 'k6/http';
  import { check, sleep } from 'k6';
  import exec from 'k6/execution';
  import {
    loadUsersFromCsv,
    loadPayloadsFromJson,
    pickRandom,
  } from '../../scripts/lib/dataset.js';
  import { buildHandleSummary } from '../../scripts/lib/summary.js';

  const usersCsv = open('../../data/users.csv');
  const payloadsJson = open('../../data/payloads.json');
  const users = loadUsersFromCsv(usersCsv);
  const payloads = loadPayloadsFromJson(payloadsJson);

  const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

  export const options = {
    scenarios: {
      // Escenario 1: lectores constantes (VU-based).
      readers: {
        executor: 'constant-vus',
        vus: 8,
        duration: '2m',
        exec: 'readScenario',
        tags: { scenario: 'readers' },
      },
      // Escenario 2: escritores con tasa controlada (arrival-rate).
      // k6 se asegura de que haya ~3 peticiones nuevas por segundo,
      // ajustando VUs según necesite entre preAllocatedVUs y maxVUs.
      writers: {
        executor: 'constant-arrival-rate',
        rate: 3,
        timeUnit: '1s',
        duration: '2m',
        preAllocatedVUs: 5,
        maxVUs: 20,
        exec: 'writeScenario',
        tags: { scenario: 'writers' },
      },
    },
    thresholds: {
      'http_req_failed': ['rate<0.02'],
      // Thresholds segmentados por escenario.
      'http_req_duration{scenario:readers}': ['p(95)<500'],
      'http_req_duration{scenario:writers}': ['p(95)<400'],
      'http_reqs{scenario:writers}': ['rate>2.5'], // 3/s es el objetivo, toleramos 2.5
    },
  };

  export function readScenario() {
    const r = Math.random();
    const res = r < 0.7
      ? http.get(`${BASE_URL}/fast`, { tags: { endpoint: 'fast' } })
      : http.get(`${BASE_URL}/cpu?rounds=3000`, { tags: { endpoint: 'cpu' } });
    check(res, { 'read 200': (x) => x.status === 200 });
    sleep(0.3);
  }

  export function writeScenario() {
    const user = pickRandom(users);
    const payload = pickRandom(payloads);
    const body = JSON.stringify({ message: payload.message, user_id: user.id });
    const res = http.post(`${BASE_URL}/echo`, body, {
      headers: {
        'Content-Type': 'application/json',
        'X-User-Email': user.email,
      },
      tags: { endpoint: 'echo', category: payload.category },
    });
    check(res, {
      'write 200': (r) => r.status === 200,
      'write preserva user_id': (r) => r.json('received.user_id') === user.id,
    });
    // No sleep aquí: arrival-rate controla la tasa, no el VU.
  }

  export const handleSummary = buildHandleSummary('mixed-scenarios');