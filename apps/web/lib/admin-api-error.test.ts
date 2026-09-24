import { describe, it, expect, vi } from 'vitest';
import { adminApiError } from './admin-api-error';

describe('adminApiError', () => {
  it('returns the given status with a {error:{code,message,requestId}} body', async () => {
    const response = adminApiError(403, 'forbidden', 'You cannot do that');
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe('forbidden');
    expect(body.error.message).toBe('You cannot do that');
    expect(typeof body.error.requestId).toBe('string');
    expect(body.error.requestId.length).toBeGreaterThan(0);
  });

  it('includes details when given', async () => {
    const response = adminApiError(400, 'invalid_request', 'Bad field', { field: 'title' });
    const body = await response.json();
    expect(body.error.details).toEqual({ field: 'title' });
  });

  it('omits details when not given', async () => {
    const response = adminApiError(404, 'not_found', 'Missing');
    const body = await response.json();
    expect(body.error).not.toHaveProperty('details');
  });

  it('generates a different requestId on every call', async () => {
    const a = await adminApiError(400, 'invalid_request', 'x').json();
    const b = await adminApiError(400, 'invalid_request', 'x').json();
    expect(a.error.requestId).not.toBe(b.error.requestId);
  });

  it('logs a warning containing the same requestId as the response body', async () => {
    const logSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const response = adminApiError(409, 'conflict', 'Already advanced');
    const body = await response.json();
    expect(logSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(logged.requestId).toBe(body.error.requestId);
    expect(logged.code).toBe('conflict');
    logSpy.mockRestore();
  });
});
