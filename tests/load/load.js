  import http from 'k6/http';
  import { check, sleep } from 'k6';
  import { buildHandleSummary } from '../../scripts/lib/summary.js';

  const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

  export const options = {
    stages: [
      { duration: '30s', target: 10 }, // ramp-up
      { duration: '2m',  target: 10 }, // meseta (tráfico "normal")
      { duration: '30s', target: 0  }, // ramp-down
    ],
    tags: { test_type: 'load' },
    thresholds: {
      // SLO producción: 95% < 500 ms global, 99% < 1s, errores <1%.
      'http_req_failed':  ['rate<0.01'],
      'http_req_duration': ['p(95)<500', 'p(99)<1000'],
      'checks':           ['rate>0.99'],
      // Umbrales por endpoint (cada uno con su SLO específico).
      'http_req_duration{endpoint:fast}': ['p(95)<50'],
      'http_req_duration{endpoint:cpu}':  ['p(95)<400'],
    },
  };

  export default function () {
    const r = Math.random();
    let res;
    if (r < 0.6) {
      res = http.get(`${BASE_URL}/fast`, { tags: { endpoint: 'fast' } });
    } else if (r < 0.9) {
      res = http.get(`${BASE_URL}/cpu?rounds=3000`, { tags: { endpoint: 'cpu' } });
    } else {
      const payload = JSON.stringify({ message: 'load', user_id: __VU });
      res = http.post(`${BASE_URL}/echo`, payload, {
        headers: { 'Content-Type': 'application/json' },
        tags: { endpoint: 'echo' },
      });
    }
    check(res, { 'status 2xx': (x) => x.status >= 200 && x.status < 300 });
    sleep(0.5);
  }

  export const handleSummary = buildHandleSummary('load');