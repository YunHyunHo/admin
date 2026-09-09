import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { routeChargeKey } from '../src/lib/preview-charge-key.ts';

// Deliberately synthetic test values, never deployed credentials.
const key = 'wp_preview_' + 'x'.repeat(43);
const env = {
  VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'codex/maple-sse-no-polling',
  MAPLE_PREVIEW_CHARGE_API_KEY: key,
  MAPLE_PREVIEW_CHARGE_DOMAIN_ID: '11111111-1111-4111-8111-111111111111',
  MAPLE_PREVIEW_CHARGE_KEY_EXPIRES_AT: '2030-01-01T00:00:00Z',
};
const now = Date.parse('2026-01-01T00:00:00Z');
assert.deepEqual(routeChargeKey(key, env, now), {kind:'preview', domainId:env.MAPLE_PREVIEW_CHARGE_DOMAIN_ID});
for (const overrides of [
  {VERCEL_ENV:'production'}, {VERCEL_ENV:'development'}, {VERCEL_ENV:undefined},
  {VERCEL_GIT_COMMIT_REF:'main'}, {MAPLE_PREVIEW_CHARGE_API_KEY:''},
  {MAPLE_PREVIEW_CHARGE_DOMAIN_ID:''}, {MAPLE_PREVIEW_CHARGE_KEY_EXPIRES_AT:''},
  {MAPLE_PREVIEW_CHARGE_KEY_EXPIRES_AT:'2025-01-01T00:00:00Z'},
]) assert.equal(routeChargeKey(key,{...env,...overrides},now).kind,'reject');
assert.equal(routeChargeKey(key+'wrong',env,now).kind,'reject');
assert.equal(routeChargeKey(key,env,Date.parse(env.MAPLE_PREVIEW_CHARGE_KEY_EXPIRES_AT)).kind,'reject');
assert.equal(routeChargeKey('',env,now).kind,'reject');
const legacy = 'wp_live_synthetic_example_not_a_real_key';
for(const environment of ['production','preview','development']) {
  assert.deepEqual(routeChargeKey(` ${legacy} `,{...env,VERCEL_ENV:environment},now),
    {kind:'legacy',hash:createHash('sha256').update(legacy).digest('hex')});
}
console.log('PASS: Preview environment/branch/expiry/key isolation; unchanged legacy hash routing');
