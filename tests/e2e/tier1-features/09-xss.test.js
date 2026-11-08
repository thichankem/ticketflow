import { test, describe, after } from 'node:test';
import assert from 'node:assert';
import { createTestClient, teardownTestEnv } from '../helpers/test-env.js';
import { assertStatus, assertOk } from '../helpers/assertions.js';

describe('Tier 1: Feature 09 - Input & Rich Text XSS Sanitization', () => {
  after(async () => {
    await teardownTestEnv();
  });

  test('9.1: Event description containing <script> tag is sanitized and stripped', async () => {
    const client = await createTestClient();
    const loginRes = await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginRes.body.token);

    const maliciousDescription = '<p>Welcome!</p><script>alert("XSS")</script><b>Great speakers</b>';
    const res = await client.post('/events', {
      title: 'Security Showcase 2026',
      description: maliciousDescription,
    });

    assertStatus(res, 201);
    const sanitizedDesc = res.body.event.description;
    assert.strictEqual(sanitizedDesc.includes('<script>'), false, '<script> tag must be removed');
    assert.strictEqual(sanitizedDesc.includes('alert('), false, 'alert script payload must be removed');
  });

  test('9.2: Event title containing <img src=x onerror=alert(1)> has event handlers stripped', async () => {
    const client = await createTestClient();
    const loginRes = await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginRes.body.token);

    const maliciousTitle = 'Tech Day <img src=x onerror="alert(\'pwned\')">';
    const res = await client.post('/events', {
      title: maliciousTitle,
      description: 'Clean event',
    });

    assertStatus(res, 201);
    const sanitizedTitle = res.body.event.title;
    assert.strictEqual(sanitizedTitle.includes('onerror='), false, 'Inline event handler onerror must be stripped');
    assert.strictEqual(sanitizedTitle.includes('pwned'), false);
  });

  test('9.3: Event description containing <iframe> tag is sanitized', async () => {
    const client = await createTestClient();
    const loginRes = await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginRes.body.token);

    const maliciousIframe = '<p>Schedule</p><iframe src="http://evil.com/phish"></iframe>';
    const res = await client.post('/events', {
      title: 'Annual Meetup',
      description: maliciousIframe,
    });

    assertStatus(res, 201);
    const desc = res.body.event.description;
    assert.strictEqual(desc.includes('<iframe'), false, '<iframe> elements must be stripped');
  });

  test('9.4: Attendee name containing javascript: payload is sanitized', async () => {
    const client = await createTestClient();
    const reserveRes = await client.post('/public/events/1/order', {
      items: [{ ticket_tier_id: 1, quantity: 1 }],
    });
    const orderId = reserveRes.body.orderId;

    const checkoutRes = await client.post(`/orders/${orderId}/checkout`, {
      buyer: { name: 'Normal Buyer', email: 'normal@test.local' },
      attendees: [{
        name: 'Attacker <a href="javascript:alert(1)">Click Me</a>',
        email: 'attacker@test.local',
        ticket_tier_id: 1,
      }],
      payment_method: 'OFFLINE',
    });

    assertStatus(checkoutRes, 200);
    const attendeeName = checkoutRes.body.attendees[0].name;
    assert.strictEqual(attendeeName.includes('javascript:'), false, 'javascript: URI scheme must be stripped');
  });

  test('9.5: Promo code with HTML markup is stripped and normalized', async () => {
    const client = await createTestClient();
    const loginRes = await client.post('/auth/login', {
      email: 'organizer@ticketflow.local',
      password: 'password123',
    });
    client.setToken(loginRes.body.token);

    const res = await client.post('/events/1/promos', {
      code: '<b>PROMO50</b>',
      discount_type: 'PERCENTAGE',
      discount_amount: 50,
      max_uses: 10,
    });

    assertStatus(res, 201);
    assert.strictEqual(res.body.promo.code.includes('<b>'), false, 'HTML markup in promo code must be stripped');
    assert.strictEqual(res.body.promo.code, 'PROMO50');
  });
});
