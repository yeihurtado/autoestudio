  import http from 'k6/http';
  import { check, sleep } from 'k6';
  import exec from 'k6/execution';
  import {
    loadUsersFromCsv,
    loadPayloadsFromJson,
    pickRandom,
  } from '../../scripts/lib/dataset.js';
  import { buildHandleSummary } from '../../scripts/lib/summary.js';

  // open() vive en init context, no dentro de default().
  const usersCsv = open('../../data/users.csv');
  const payloadsJson = open('../../data/payloads.json');

  const users = loadUsersFromCsv(usersCsv);
  const payloads = loadPayloadsFromJson(payloadsJson);

  const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

  export const options = {
    stages: [
      { duration: '30s', target: 10 },
      { duration: '1m30s', target: 10 },
      { duration: '30s', target: 0 },
    ],
    tags: { test_type: 'load_parametrized' },
    thresholds: {
      'http_req_failed': ['rate<0.01'],
      'http_req_duration': ['p(95)<500'],
      'http_req_duration{category:critical}': ['p(95)<300'], // SLO más estricto
      'checks': ['rate>0.99'],
    },
  };

  export function setup() {
    console.log(`[setup] users cargados: ${users.length}`);
    console.log(`[setup] payloads cargados: ${payloads.length}`);
    return { startedAt: new Date().toISOString() };
  }

  export default function () {
    const user = pickRandom(users);
    const payload = pickRandom(payloads);

    const body = JSON.stringify({
      message: payload.message,
      user_id: user.id,
    });

    const params = {
      headers: {
        'Content-Type': 'application/json',
        'X-User-Email': user.email,       // header derivado del dataset
        'X-Request-VU': String(exec.vu.idInTest),
      },
      tags: {
        endpoint: 'echo',
        priority: String(payload.priority),
        category: payload.category,
      },
    };

    const res = http.post(`${BASE_URL}/echo`, body, params);

    const ok = check(res, {
      'status 200': (r) => r.status === 200,
      'echo preserva user_id': (r) => r.json('received.user_id') === user.id,
      'echo preserva message': (r) => r.json('received.message') === payload.message,
    });

    // Log solo del 1% de las iteraciones para no inundar la consola.
    if (!ok || Math.random() < 0.01) {
      console.log(
        `[vu=${exec.vu.idInTest} iter=${exec.vu.iterationInScenario}] ` +
        `user=${user.id} payload="${payload.message}" status=${res.status}`
      );
    }

    sleep(0.5);
  }

  export const handleSummary = buildHandleSummary('load-parametrized');