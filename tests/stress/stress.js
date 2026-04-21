import http from 'k6/http';
import { check, sleep } from 'k6';
import { buildHandleSummary } from '../../scripts/lib/summary.js';

  const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

  export const options = {
    stages: [
      { duration: '30s', target: 10 },
      { duration: '1m',  target: 30 },
      { duration: '1m',  target: 50 }, // empuje final
      { duration: '1m',  target: 50 }, // meseta dolorosa
      { duration: '30s', target: 0  },
    ],
    tags: { test_type: 'stress' },
    thresholds: {
      // Mantenemos el SLO de producción. Si falla, significa que el sistema
      // NO cumple su contrato bajo esta carga → conclusión del stress test.
      'http_req_failed':  ['rate<0.02'],
      'http_req_duration': ['p(95)<1000'],
      'http_req_duration{endpoint:cpu}': ['p(95)<500'],
    },
  };

  export default function () {
    const r = Math.random();
    let res;
    if (r < 0.4) {
      res = http.get(`${BASE_URL}/fast`, { tags: { endpoint: 'fast' } });
    } else if (r < 0.9) {
      // CPU-bound con rounds mayores → bloqueará el event loop del SUT.
      res = http.get(`${BASE_URL}/cpu?rounds=8000`, { tags: { endpoint: 'cpu' } });
    } else {
      const payload = JSON.stringify({ message: 'stress', user_id: __VU });
      res = http.post(`${BASE_URL}/echo`, payload, {
        headers: { 'Content-Type': 'application/json' },
        tags: { endpoint: 'echo' },
      });
    }
    check(res, { 'status 2xx': (x) => x.status >= 200 && x.status < 300 });
    sleep(0.3);
  }

  export const handleSummary = buildHandleSummary('stress');