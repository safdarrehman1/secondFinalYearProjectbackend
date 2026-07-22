const httpStatus = require('http-status');
const request = require('supertest');
const app = require('../../src/app');
const config = require('../../src/config/config');

describe('Security and operational endpoints', () => {
  test('health endpoint reports a live process', async () => {
    const response = await request(app).get('/health').expect(httpStatus.OK);
    expect(response.body).toEqual({ status: 'ok' });
  });

  test('database clearing is not available through GET', async () => {
    await request(app).get('/v1/clear-database').expect(httpStatus.NOT_FOUND);
  });

  test('database clearing requires authentication', async () => {
    await request(app).post('/v1/clear-database').expect(httpStatus.UNAUTHORIZED);
  });

  test('allows configured browser origins', async () => {
    const origin = config.cors.allowedOrigins[0];
    const response = await request(app).get('/health').set('Origin', origin).expect(httpStatus.OK);
    expect(response.headers['access-control-allow-origin']).toBe(origin);
  });

  test('rejects unconfigured browser origins', async () => {
    await request(app)
      .get('/health')
      .set('Origin', 'https://untrusted.invalid')
      .expect(httpStatus.FORBIDDEN);
  });
});
