import { request } from '@playwright/test';
import { API_URL, UI_URL } from '../playwright.config';
import { REFERENCE_NOW_ISO } from './api';

/** Fail fast with a readable message if the compose stack is not up, then put DB + clock into the seed state. */
export default async function globalSetup() {
  const ctx = await request.newContext();
  try {
    const health = await ctx.get(`${API_URL}/actuator/health`).catch(() => null);
    if (!health || !health.ok()) {
      throw new Error(`Backend not healthy at ${API_URL}. Start the stack with: npm run stack:up`);
    }
    const ui = await ctx.get(UI_URL).catch(() => null);
    if (!ui || !ui.ok()) throw new Error(`Frontend not reachable at ${UI_URL}. Start the stack with: npm run stack:up`);
    const clock = await ctx.get(`${API_URL}/api/test/clock`);
    if (clock.status() === 404) {
      throw new Error('Test clock/reset endpoints are disabled. Start the backend with OLB_TEST_CLOCK_ENABLED=true (npm run stack:up).');
    }
    await ctx.post(`${API_URL}/api/test/clock`, { data: { now: REFERENCE_NOW_ISO } });
    const reset = await ctx.post(`${API_URL}/api/test/reset`);
    if (!reset.ok()) throw new Error(`Database reset failed: ${reset.status()} ${await reset.text()}`);
  } finally {
    await ctx.dispose();
  }
}
