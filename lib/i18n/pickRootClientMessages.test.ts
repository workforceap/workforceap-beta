import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AbstractIntlMessages } from 'next-intl';
import {
  ADMIN_DASHBOARD_CLIENT_KEYS,
  clientMessagesBytes,
  pickAdminClientMessages,
  pickApplyClientMessages,
  pickAuthClientMessages,
  pickLegacyFatRootClientMessages,
  pickPortalClientMessages,
  pickRootClientMessages,
  pickWioaClientMessages,
} from './pickRootClientMessages';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const catalog = JSON.parse(
  readFileSync(join(root, 'messages/en.json'), 'utf8'),
) as AbstractIntlMessages;

function ns(messages: AbstractIntlMessages, key: string): Record<string, unknown> {
  const value = (messages as Record<string, unknown>)[key];
  assert.equal(typeof value, 'object');
  return value as Record<string, unknown>;
}

test('full catalog is the documented 184KB on-disk tax', () => {
  const fileBytes = readFileSync(join(root, 'messages/en.json')).byteLength;
  assert.ok(fileBytes > 180_000, `expected ~184KB file, got ${fileBytes}`);
});

test('legacy fat picker still ships admin + apply + dashboard to every client', () => {
  const fat = pickLegacyFatRootClientMessages(catalog);
  assert.ok(ns(fat, 'admin'));
  assert.ok(ns(fat, 'apply'));
  assert.ok(ns(fat, 'dashboard'));
  assert.ok(clientMessagesBytes(fat) > 100_000);
});

test('root picker keeps a marketing nav string and drops admin/portal/apply', () => {
  const rootMessages = pickRootClientMessages(catalog);
  assert.equal(ns(rootMessages, 'nav').programs, 'Programs');
  const testimonials = ns(rootMessages, 'marketing').testimonials as Record<string, unknown>;
  assert.equal(testimonials.sectionTitle, 'Hear from our members');
  assert.equal((rootMessages as Record<string, unknown>).admin, undefined);
  assert.equal((rootMessages as Record<string, unknown>).dashboard, undefined);
  assert.equal((rootMessages as Record<string, unknown>).apply, undefined);
  assert.ok(clientMessagesBytes(rootMessages) < 20_000);
});

test('portal picker keeps a dashboard string and drops admin/apply/marketing', () => {
  const portal = pickPortalClientMessages(catalog);
  assert.equal(typeof ns(portal, 'dashboard').welcome, 'string');
  assert.ok(String(ns(portal, 'dashboard').welcome).length > 0);
  assert.equal((portal as Record<string, unknown>).admin, undefined);
  assert.equal((portal as Record<string, unknown>).apply, undefined);
  assert.equal((portal as Record<string, unknown>).marketing, undefined);
});

test('admin / apply / auth slices stay on their own catalogs', () => {
  const admin = pickAdminClientMessages(catalog);
  const apply = pickApplyClientMessages(catalog);
  const auth = pickAuthClientMessages(catalog);
  assert.ok(ns(admin, 'admin'));
  assert.ok(ns(admin, 'courseraProgress'));
  assert.equal(ns(admin, 'courseraProgress').title, 'Coursera progress');
  assert.equal(ns(admin, 'workspace').admin, 'Admin workspace');
  assert.equal(ns(admin, 'group').workflows, 'Workflows');
  // Only the MemberProgressStrip keys ride along — not the member dashboard catalog.
  assert.equal(ns(admin, 'dashboard').welcome, undefined);
  assert.ok(ns(apply, 'apply'));
  assert.equal((apply as Record<string, unknown>).admin, undefined);
  assert.ok(ns(auth, 'auth'));
  assert.equal((auth as Record<string, unknown>).apply, undefined);
});

test('admin slice ships exactly the MemberProgressStrip dashboard keys', () => {
  const admin = pickAdminClientMessages(catalog);
  const dashboard = ns(admin, 'dashboard');
  assert.deepEqual(Object.keys(dashboard).sort(), [...ADMIN_DASHBOARD_CLIENT_KEYS].sort());
  assert.equal(dashboard.progressIntake, 'Intake');
  assert.equal(dashboard.progressAssessment, 'Assessment');
  assert.equal(dashboard.memberJourneyProgress, 'Member journey progress');
  assert.equal(dashboard.stepComplete, '{label}: complete');
  const fullDashboardBytes = clientMessagesBytes(
    (catalog as Record<string, unknown>).dashboard as AbstractIntlMessages,
  );
  const sliceBytes = clientMessagesBytes(dashboard as AbstractIntlMessages);
  assert.ok(sliceBytes < 600, `strip slice ${sliceBytes}B should stay tiny`);
  assert.ok(sliceBytes < fullDashboardBytes / 20, `slice ${sliceBytes} vs full dashboard ${fullDashboardBytes}`);
});

test('admin slice dashboard keys resolve in every shipped locale', () => {
  for (const locale of ['es', 'fr', 'pt']) {
    const localeCatalog = JSON.parse(
      readFileSync(join(root, `messages/${locale}.json`), 'utf8'),
    ) as AbstractIntlMessages;
    const dashboard = ns(pickAdminClientMessages(localeCatalog), 'dashboard');
    for (const key of ADMIN_DASHBOARD_CLIENT_KEYS) {
      assert.equal(typeof dashboard[key], 'string', `${locale}: dashboard.${key}`);
    }
  }
});

test('wioa slice carries the screening catalog plus chrome, and root/apply/auth omit it', () => {
  // /wioa-qualification: WioaQualificationClient reads useTranslations('wioa') on the
  // client; the page also renders <Footer />, so chrome must ride along.
  const wioa = pickWioaClientMessages(catalog);
  assert.equal(ns(wioa, 'wioa').title, ns(catalog, 'wioa').title);
  assert.equal(typeof ns(wioa, 'wioa').publicIntro, 'string');
  assert.equal(typeof ns(wioa, 'footer'), 'object');
  assert.equal((wioa as Record<string, unknown>).admin, undefined);
  assert.equal((wioa as Record<string, unknown>).apply, undefined);
  assert.ok(clientMessagesBytes(wioa) < 25_000, `wioa slice ${clientMessagesBytes(wioa)}B`);
  // The catalog attaches in app/wioa-qualification/layout.tsx, not the root payload.
  assert.equal((pickRootClientMessages(catalog) as Record<string, unknown>).wioa, undefined);
  assert.equal((pickApplyClientMessages(catalog) as Record<string, unknown>).wioa, undefined);
  assert.equal((pickAuthClientMessages(catalog) as Record<string, unknown>).wioa, undefined);
  // The member portal renders the same client at /dashboard/learning/wioa-qualification.
  assert.equal(ns(pickPortalClientMessages(catalog), 'wioa').title, ns(catalog, 'wioa').title);
});

test('portal slice carries every namespace a portal client component reads', () => {
  // components/portal/MemberApprovalStatusCard (/dashboard) rendered raw
  // `memberApproval.*` keys for the same reason the public WIOA page did.
  for (const locale of ['en', 'es', 'fr', 'pt']) {
    const localeCatalog = JSON.parse(
      readFileSync(join(root, `messages/${locale}.json`), 'utf8'),
    ) as AbstractIntlMessages;
    const portal = pickPortalClientMessages(localeCatalog);
    for (const key of ['title', 'intro', 'contact']) {
      assert.equal(typeof ns(portal, 'memberApproval')[key], 'string', `${locale}: memberApproval.${key}`);
    }
    assert.equal(typeof ns(portal, 'wioa').title, 'string', `${locale}: wioa.title`);
  }
  assert.equal((pickRootClientMessages(catalog) as Record<string, unknown>).memberApproval, undefined);
});

test('wioa slice resolves in every shipped locale', () => {
  for (const locale of ['en', 'es', 'fr', 'pt']) {
    const localeCatalog = JSON.parse(
      readFileSync(join(root, `messages/${locale}.json`), 'utf8'),
    ) as AbstractIntlMessages;
    const wioa = ns(pickWioaClientMessages(localeCatalog), 'wioa');
    for (const key of ['title', 'kicker', 'publicIntro', 'fullName', 'send']) {
      assert.equal(typeof wioa[key], 'string', `${locale}: wioa.${key}`);
    }
    assert.equal(typeof wioa.reasons, 'object', `${locale}: wioa.reasons`);
  }
});

test('root payload is a fraction of the full catalog and of the legacy union', () => {
  const fullBytes = clientMessagesBytes(catalog);
  const legacyBytes = clientMessagesBytes(pickLegacyFatRootClientMessages(catalog));
  const rootBytes = clientMessagesBytes(pickRootClientMessages(catalog));
  const portalBytes = clientMessagesBytes(pickPortalClientMessages(catalog));
  assert.ok(rootBytes < legacyBytes / 4, `root ${rootBytes} vs legacy ${legacyBytes}`);
  assert.ok(rootBytes < fullBytes / 8, `root ${rootBytes} vs full ${fullBytes}`);
  assert.ok(portalBytes < legacyBytes, `portal ${portalBytes} vs legacy ${legacyBytes}`);
});
