import { createMockServer } from './mock-server.js';
import { ApiClient } from './api-client.js';

let sharedServerInstance = null;
let sharedApiUrl = process.env.API_URL || null;

export async function getTestApiUrl() {
  if (sharedApiUrl) {
    return sharedApiUrl;
  }

  // Check if live server is reachable at default localhost:3000
  try {
    const res = await fetch('http://localhost:3000/api/events', { signal: AbortSignal.timeout(500) });
    if (res.status < 500) {
      sharedApiUrl = 'http://localhost:3000/api';
      return sharedApiUrl;
    }
  } catch {
    // Live server offline, spin up mock server
  }

  if (!sharedServerInstance) {
    const mock = createMockServer();
    const running = await mock.listen(0);
    sharedServerInstance = running;
    sharedApiUrl = running.url;
  }

  return sharedApiUrl;
}

export async function getFrontendUrl() {
  const apiUrl = await getTestApiUrl();
  return process.env.FRONTEND_URL || apiUrl.replace(/\/api$/, '');
}

export async function createTestClient() {
  const url = await getTestApiUrl();
  return new ApiClient(url);
}

export async function createFrontendClient() {
  const frontendUrl = await getFrontendUrl();
  return new ApiClient(frontendUrl);
}

export async function teardownTestEnv() {
  if (sharedServerInstance) {
    await sharedServerInstance.close();
    sharedServerInstance = null;
    sharedApiUrl = null;
  }
}
