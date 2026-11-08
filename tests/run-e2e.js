import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse CLI flags
const args = process.argv.slice(2);
let tierFilter = 'all';
let mode = 'auto'; // 'auto' | 'live' | 'mock'

for (const arg of args) {
  if (arg.startsWith('--tier=')) {
    tierFilter = arg.split('=')[1];
  } else if (arg === '--live') {
    mode = 'live';
  } else if (arg === '--mock') {
    mode = 'mock';
  }
}

console.log('='.repeat(70));
console.log(' Ticketflow Hi.Events Clone — Requirement-Driven E2E Test Runner');
console.log('='.repeat(70));
console.log(` Mode: ${mode.toUpperCase()} | Tier Filter: ${tierFilter}`);

async function checkLiveServer(url = 'http://localhost:3000/api/events') {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(600) });
    return res.status < 500;
  } catch {
    return false;
  }
}

async function main() {
  if (mode === 'live') {
    const isLive = await checkLiveServer();
    if (!isLive) {
      console.error('\n[ERROR] --live flag was specified but target server is not reachable at http://localhost:3000/api.');
      process.exit(1);
    }
    console.log(' [TARGET] Live Server detected at http://localhost:3000/api');
  } else if (mode === 'mock') {
    console.log(' [TARGET] In-memory reference oracle server (offline verification)');
  } else {
    const isLive = await checkLiveServer();
    if (isLive) {
      console.log(' [TARGET] Live Server detected at http://localhost:3000/api');
      process.env.API_URL = 'http://localhost:3000/api';
    } else {
      console.log(' [TARGET] Live server offline. Using embedded reference oracle.');
    }
  }

  // Find test files
  const testFiles = [];
  const rootTestsDir = path.join(__dirname, 'e2e');

  function scanDir(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.test.js')) {
        testFiles.push(fullPath);
      }
    }
  }

  scanDir(rootTestsDir);

  // Filter test files
  const filteredFiles = testFiles.filter(file => {
    const normalized = file.replace(/\\/g, '/');
    if (tierFilter === '1' || tierFilter === 'tier1') {
      return normalized.includes('/tier1-features/');
    }
    if (tierFilter === '2' || tierFilter === 'tier2') {
      return normalized.includes('/tier2-boundaries/');
    }
    if (tierFilter === '3' || tierFilter === 'tier3') {
      return normalized.includes('/tier3-combinations/');
    }
    if (tierFilter === '4' || tierFilter === 'tier4') {
      return normalized.includes('/tier4-scenarios/');
    }
    return true; // all
  });

  if (filteredFiles.length === 0) {
    console.error(`\n[ERROR] No test files matched filter tier=${tierFilter}`);
    process.exit(1);
  }

  console.log(` Found ${filteredFiles.length} test suite file(s). Running with node:test...\n`);

  const startTime = Date.now();
  const nodeArgs = ['--test', '--test-concurrency=1', '--test-reporter=spec', ...filteredFiles];
  const proc = spawn(process.execPath, nodeArgs, {
    stdio: 'inherit',
    env: process.env,
  });

  proc.on('close', code => {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('\n' + '='.repeat(70));
    if (code === 0) {
      console.log(` [PASSED] E2E Test Suite successfully completed in ${duration}s!`);
    } else {
      console.log(` [FAILED] E2E Test Suite failed with exit code ${code} in ${duration}s.`);
    }
    console.log('='.repeat(70));
    process.exit(code);
  });
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
