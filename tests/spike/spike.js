  import http from 'k6/http';
  import { check, sleep } from 'k6';
  import { buildHandleSummary } from '../../scripts/lib/summary.js';

  const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

  export const options = {
    stages: [
      { duration: '30s', target: 2  }, // baseline
      { duration: '15s', target: 60 }, // SPIKE ↑
      { duration: '45s', target: 60 }, // pico sostenido
      { duration: '15s', target: 2  }, // SPIKE ↓
      { duration: '30s', target: 2  }, // valle → ¿se recupera?
    ],
    tags: { test_type: 'spike' },
    thresholds: {
      // En spike toleramos más error durante el pico, pero exigimos que
      // durante los periodos baseline/valle la latencia vuelva a ser sana.
      'http_req_failed':  ['rate<0.05'],
      'http_req_duration': ['p(95)<1500'],
    },
  };

  export default function () {
    const r = Math.random();
    const res = r < 0.7
      ? http.get(`${BASE_URL}/fast`, { tags: { endpoint: 'fast' } })
      : http.get(`${BASE_URL}/cpu?rounds=5000`, { tags: { endpoint: 'cpu' } });
    check(res, { 'status 2xx': (x) => x.status >= 200 && x.status < 300 });
    sleep(0.2);
  }

  export const handleSummary = buildHandleSummary('spike');