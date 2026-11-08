import assert from 'node:assert';

export function assertStatus(response, expectedStatus, message = '') {
  assert.strictEqual(
    response.status,
    expectedStatus,
    `Expected status ${expectedStatus} but got ${response.status}. Message: ${message}. Response body: ${JSON.stringify(response.body)}`
  );
}

export function assertOk(response, message = '') {
  assert.ok(
    response.ok,
    `Expected response.ok (2xx) but got ${response.status}. Message: ${message}. Response body: ${JSON.stringify(response.body)}`
  );
}

export function assertError(response, expectedStatus, expectedSnippet = '') {
  assert.strictEqual(
    response.status,
    expectedStatus,
    `Expected error status ${expectedStatus} but got ${response.status}. Response: ${JSON.stringify(response.body)}`
  );
  if (expectedSnippet) {
    const text = typeof response.body === 'object' ? JSON.stringify(response.body) : String(response.rawText || '');
    assert.match(
      text,
      new RegExp(expectedSnippet, 'i'),
      `Expected response to contain "${expectedSnippet}", got: "${text}"`
    );
  }
}

export function assertJsonStructure(object, expectedKeys = []) {
  assert.ok(object && typeof object === 'object', `Expected object, got ${typeof object}`);
  for (const key of expectedKeys) {
    assert.ok(
      key in object,
      `Expected key "${key}" in object, available keys: [${Object.keys(object).join(', ')}]`
    );
  }
}
