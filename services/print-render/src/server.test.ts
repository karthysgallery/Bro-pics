import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createServer } from './server';

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const app = createServer();
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
