import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    ddos_attack: {
      executor: 'constant-arrival-rate',
      rate: 200,             // 200 requests per second
      timeUnit: '1s',
      duration: '1m',
      preAllocatedVUs: 100,  // How many VUs to start with
      maxVUs: 500,           // Max VUs if the rate isn't reached
    },
  },
  thresholds: {
    http_req_failed: ['rate>0.1'], // We expect many to fail if auto-ban works
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';

export default function () {
  // Hit the health check or a public endpoint repeatedly
  const res = http.get(`${BASE_URL}/admin/system/incident/sessions`);
  
  check(res, {
    'status is 200': (r) => r.status === 200,
    'status is 403 (banned)': (r) => r.status === 403,
    'status is 429 (rate limited)': (r) => r.status === 429,
  });

  // Small sleep to vary the attack pattern slightly per VU
  sleep(Math.random() * 0.5);
}
