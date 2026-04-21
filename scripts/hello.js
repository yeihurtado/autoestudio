import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 1,
  duration: '10s',
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
export default function () {
  const res = http.get(`${BASE_URL}/fast`);
  check(res, {
    'status es 200': (r) => r.status === 200,
    'endpoint es fast': (r) => r.json('endpoint') === 'fast',
  });
  sleep(1);
}