import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import { createTestClient, teardownTestEnv } from '../helpers/test-env.js';
import { assertStatus } from '../helpers/assertions.js';

describe('Tier 2: Boundary 09 - Adversarial XSS & Evasion Payloads', () => {
  after(async () => {
    await teardownTestEnv();
  });

  test('2.9.1: Payload with nested script tags <scr<script>ipt> has script elements eliminated', async () => {
    const client = await createTestClient();
    const loginRes = await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginRes.body.token);

    const payload = 'Event <scr<script>ipt>alert(1)</script>Title';
    const res = await client.post('/events', {
      title: payload,
    });
    assertStatus(res, 201);
    assert.strictEqual(res.body.event.title.includes('<script>'), false);
    assert.strictEqual(res.body.event.title.includes('alert(1)'), false);
  });

  test('2.9.2: Payload with mixed-case <sCrIpT>alert(1)</ScRiPt> is stripped cleanly', async () => {
    const client = await createTestClient();
    const loginRes = await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginRes.body.token);

    const payload = 'Conf <sCrIpT>alert(1)</ScRiPt> 2026';
    const res = await client.post('/events', {
      title: payload,
    });
    assertStatus(res, 201);
    assert.strictEqual(res.body.event.title.toLowerCase().includes('script'), false);
  });

  test('2.9.3: SVG onload payload <svg onload="alert(1)"> has onload handler stripped', async () => {
    const client = await createTestClient();
    const loginRes = await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginRes.body.token);

    const payload = 'Vector Logo <svg onload="alert(document.cookie)">';
    const res = await client.post('/events', {
      title: payload,
    });
    assertStatus(res, 201);
    assert.strictEqual(res.body.event.title.includes('onload='), false);
    assert.strictEqual(res.body.event.title.includes('alert('), false);
  });

  test('2.9.4: Malicious link href="javascript:..." inside rich text is stripped', async () => {
    const client = await createTestClient();
    const loginRes = await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginRes.body.token);

    const payload = 'Click here: <a href="javascript:alert(1)">Important details</a>';
    const res = await client.post('/events', {
      title: 'Links Test',
      description: payload,
    });
    assertStatus(res, 201);
    assert.strictEqual(res.body.event.description.includes('javascript:'), false);
  });

  test('2.9.5: HTML tags in custom attendee questions/inputs are sanitized', async () => {
    const client = await createTestClient();
    const reserveRes = await client.post('/public/events/1/order', {
      items: [{ ticket_tier_id: 1, quantity: 1 }],
    });
    const orderId = reserveRes.body.orderId;

    const checkoutRes = await client.post(`/orders/${orderId}/checkout`, {
      buyer: { name: 'Normal Buyer', email: 'normal@test.local' },
      attendees: [{
        name: 'John <script>steal()</script> Doe',
        email: 'john@test.local',
        ticket_tier_id: 1,
      }],
      payment_method: 'OFFLINE',
    });

    assertStatus(checkoutRes, 200);
    const savedName = checkoutRes.body.attendees[0].name;
    assert.strictEqual(savedName.includes('<script>'), false);
    assert.strictEqual(savedName.includes('steal()'), false);
  });
});
