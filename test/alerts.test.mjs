import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, beforeEach, describe, it } from 'node:test';

import { AlertSink, heartbeat } from '../src/alerts/index.mjs';
import { loadConfig } from '../src/config.mjs';

let server, url;
let received = [];
let status = 202;
before(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      received.push({ path: req.url, auth: req.headers.authorization, body: JSON.parse(body) });
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());
beforeEach(() => {
  received = [];
  status = 202;
});

const cfg = (extra = {}) => loadConfig({ NETWORK: 'calibnet', ALERT_SERVICE_URL: `${url}/`, ALERT_SERVICE_TOKEN: 't'.repeat(40), ...extra }, { requireKey: false });

describe('alerts: the subscriber service transport', () => {
  it('is added on top of ALERT_TRANSPORT whenever ALERT_SERVICE_URL is set', () => {
    assert.deepEqual(cfg().alerts.transports, ['console', 'service']);
    assert.deepEqual(cfg({ ALERT_TRANSPORT: 'webhook,service' }).alerts.transports, ['webhook', 'service']);
    assert.deepEqual(loadConfig({ NETWORK: 'calibnet' }, { requireKey: false }).alerts.transports, ['console']);
  });

  it('posts each alert with the bearer token, a per-network key and the rendered text', async () => {
    const sink = new AlertSink(cfg({ ALERT_TRANSPORT: '' }));
    sink.raise({ severity: 'critical', title: 'Solstice: submitShares(1) failed', body: 'reverted', context: { epoch: '1', cranker: '0xabc', balanceFil: '1' } });
    sink.raise({ severity: 'info', title: 'quiet', body: 'not sent' });
    const results = await sink.flush({ minSeverity: 'warn' });
    assert.equal(received.length, 1);
    assert.equal(received[0].path, '/api/alerts');
    assert.equal(received[0].auth, `Bearer ${'t'.repeat(40)}`);
    assert.deepEqual(
      { key: received[0].body.key, severity: received[0].body.severity, title: received[0].body.title },
      { key: 'calibnet:Solstice: submitShares(1) failed', severity: 'critical', title: 'Solstice: submitShares(1) failed' }
    );
    assert.match(received[0].body.text, /reverted[\s\S]*Network:\s+calibnet/);
    assert.ok(results.some((r) => r.transport === 'service' && r.ok));
  });

  it('a service that is down never throws into the run, and the alert still reaches the console', async () => {
    status = 503;
    const sink = new AlertSink(cfg({ ALERT_TRANSPORT: '' }));
    sink.raise({ severity: 'warn', title: 'low gas', body: 'top up' });
    const results = await sink.flush();
    assert.ok(results.some((r) => r.transport === 'service' && !r.ok));
  });

  it('heartbeat is best-effort and needs both URL and token', async () => {
    assert.equal(await heartbeat(cfg(), 'watchdog', 86_400), true);
    assert.deepEqual(received.at(-1), { path: '/api/heartbeat', auth: `Bearer ${'t'.repeat(40)}`, body: { name: 'watchdog', everySeconds: 86_400 } });
    assert.equal(await heartbeat(loadConfig({ NETWORK: 'calibnet' }, { requireKey: false }), 'watchdog', 60), false);
    status = 500;
    assert.equal(await heartbeat(cfg(), 'watchdog', 86_400), false);
  });
});
