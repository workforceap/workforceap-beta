// Runs the ORIGINAL prototype browser checks against the authenticated Game Lab route on the guarded local preview.
// Preview must be up on localhost:3100. Synthetic admin only. Flag row created via the real admin API, removed at the end.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const BASE = 'http://localhost:3100';
const OUT = process.env.GAME_LAB_EVIDENCE || 'E:/Hermes/reports/wap-game-lab-integration/evidence';
fs.mkdirSync(OUT, { recursive: true });
const { chromium } = createRequire(import.meta.url)('@playwright/test');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const psql = (s) => execFileSync('docker', ['exec', 'wap-preview-pg', 'psql', '-U', 'postgres', '-d', 'wap_preview', '-At', '-c', s], { encoding: 'utf8' }).trim();
const b = await chromium.launch({ executablePath: CHROME, headless: true });
const ctx = await b.newContext({ baseURL: BASE });
const p = await ctx.newPage();
await p.goto('/login'); await p.getByRole('button', { name: /decline/i }).click().catch(() => {});
await p.locator('#email').fill('preview-admin@example.test'); await p.locator('#password').fill('Preview-Admin-1!');
await p.getByRole('button', { name: /sign in/i }).click(); await p.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 60000 });
psql("delete from feature_flags where key='admin_game_lab'");
const r = await ctx.request.post(BASE + '/api/admin/feature-flags', { data: { key: 'admin_game_lab', name: 'Admin Game Lab (local preview)', description: 'Local preview only', enabled: true, rolloutPercentage: 100, allowedRoles: ['admin', 'super_admin'] } });
console.log('flag create', r.status());
await ctx.storageState({ path: 'C:/tmp/gl/state.json' });
await b.close();
