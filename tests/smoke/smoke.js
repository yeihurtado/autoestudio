  import http from 'k6/http';
  import { check, sleep } from 'k6';
  import { buildHandleSummary } from '../../scripts/lib/summary.js';

  const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

  export const options = {
    vus: 2,
    duration: '1m',
    tags: { test_type: 'smoke' },
    thresholds: {
      // SLO smoke: si fallan estos, nada más vale la pena correr.
      'http_req_failed':  ['rate<0.01'],
      'http_req_duration': ['p(95)<300'],
      'checks':           ['rate>0.99'],
    },
  };

  export default function () {
    const r = Math.random();
    let res;
    if (r < 0.6) {
      res = http.get(`${BASE_URL}/fast`, { tags: { endpoint: 'fast' } });
    } else if (r < 0.85) {
      res = http.get(`${BASE_URL}/slow?ms=100`, { tags: { endpoint: 'slow' } });
    } else {
      const payload = JSON.stringify({ message: 'smoke', user_id: __VU });
      res = http.post(`${BASE_URL}/echo`, payload, {
        headers: { 'Content-Type': 'application/json' },
        tags: { endpoint: 'echo' },
      });
    }
    check(res, { 'status 2xx': (x) => x.status >= 200 && x.status < 300 });
    sleep(1);
  }

  export const handleSummary = buildHandleSummary('smoke');