import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { Redis } from '@upstash/redis';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';

export const dynamic = 'force-dynamic';

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export type SubsystemCheck = {
  status: 'ok' | 'degraded' | 'fail';
  latencyMs?: number;
  note?: string;
};

export type CronHealth = SubsystemCheck & {
  lastRun?: string;
  failures?: number;
};

export type WebhookHealth = SubsystemCheck & {
  pendingRetries?: number;
};

export type XapiHealth = SubsystemCheck & {
  pendingStatements?: number;
};

export type AIToolsHealth = SubsystemCheck & {
  queueDepth?: number;
};

export type EmailHealth = SubsystemCheck & {
  backlog?: number;
};

/** email_send_logs + Resend webhook (delivery audit 2026-09-20 #4). */
export type EmailDeliveryHealth = SubsystemCheck & {
  sent24h?: number;
  failed24h?: number;
  bounced24h?: number;
  webhookConfigured?: boolean;
  lastWebhookAt?: string | null;
};

/** Discord operator bridge (delivery audit #15). */
export type DiscordHealth = SubsystemCheck & {
  configured?: boolean;
  errors24h?: number;
  dropped24h?: number;
};

/** Web push side channel (delivery audit #22). */
export type WebPushHealth = SubsystemCheck & {
  configured?: boolean;
  subscriptions?: number;
  errors24h?: number;
};

export type HealthChecks = {
  database: SubsystemCheck;
  redis: SubsystemCheck;
  prisma: SubsystemCheck;
  cronJobs: CronHealth;
  webhooks: WebhookHealth;
  xapi: XapiHealth;
  aiTools: AIToolsHealth;
  email: EmailHealth;
  emailDelivery: EmailDeliveryHealth;
  discordNotifications: DiscordHealth;
  webPush: WebPushHealth;
};

export type HealthResponse = {
  status: HealthStatus;
  checks: HealthChecks;
  generatedAt: string;
  auditSuppressed?: boolean;
};

export type HealthHistoryPoint = {
  timestamp: string;
  status: HealthStatus;
};

export type HealthHistoryResponse = {
  history: HealthHistoryPoint[];
};

/* ─── Subsystem checkers ─── */

async function checkDatabase(): Promise<SubsystemCheck> {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', latencyMs: Date.now() - started };
  } catch (err) {
    return {
      status: 'fail',
      latencyMs: Date.now() - started,
      note: err instanceof Error ? err.message : 'Database unreachable',
    };
  }
}

async function checkRedis(): Promise<SubsystemCheck> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    return { status: 'ok', note: 'Redis not configured (optional)' };
  }

  const started = Date.now();
  try {
    const redis = new Redis({ url, token });
    await redis.ping();
    return { status: 'ok', latencyMs: Date.now() - started };
  } catch (err) {
    return {
      status: 'fail',
      latencyMs: Date.now() - started,
      note: err instanceof Error ? err.message : 'Redis unreachable',
    };
  }
}

async function checkPrisma(): Promise<SubsystemCheck> {
  try {
    // Prisma exposes $connect / $disconnect, but the client is lazy.
    // A simple raw query proves the client is alive.
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  } catch (err) {
    return {
      status: 'fail',
      note: err instanceof Error ? err.message : 'Prisma client unhealthy',
    };
  }
}

async function checkCronJobs(): Promise<CronHealth> {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [lastExecution, failuresLast24h] = await Promise.all([
      prisma.cronExecution.findFirst({
        orderBy: { startedAt: 'desc' },
        select: { startedAt: true, status: true, jobName: true },
      }),
      prisma.cronExecution.count({
        where: { status: 'FAILED', startedAt: { gte: twentyFourHoursAgo } },
      }),
    ]);

    const status: SubsystemCheck['status'] =
      failuresLast24h > 5 ? 'fail' : failuresLast24h > 0 ? 'degraded' : 'ok';

    return {
      status,
      lastRun: lastExecution?.startedAt?.toISOString() ?? undefined,
      failures: failuresLast24h,
      note: lastExecution
        ? `Last: ${lastExecution.jobName} (${lastExecution.status})`
        : 'No executions recorded',
    };
  } catch (err) {
    return {
      status: 'fail',
      note: err instanceof Error ? err.message : 'Cron check failed',
    };
  }
}

async function checkWebhooks(): Promise<WebhookHealth> {
  try {
    const pendingRetries = await prisma.webhookEvent.count({
      where: { status: { in: ['retrying', 'failed'] } },
    });

    const status: SubsystemCheck['status'] =
      pendingRetries > 50 ? 'fail' : pendingRetries > 10 ? 'degraded' : 'ok';

    return {
      status,
      pendingRetries,
      note: pendingRetries > 0 ? `${pendingRetries} events need retry` : 'Queue clear',
    };
  } catch (err) {
    return {
      status: 'fail',
      note: err instanceof Error ? err.message : 'Webhook check failed',
    };
  }
}

async function checkXapi(): Promise<XapiHealth> {
  try {
    const pendingStatements = await prisma.xapiStatement.count({
      where: { processed: false },
    });

    const status: SubsystemCheck['status'] =
      pendingStatements > 1000 ? 'fail' : pendingStatements > 500 ? 'degraded' : 'ok';

    return {
      status,
      pendingStatements,
      note:
        pendingStatements > 0
          ? `${pendingStatements} statements pending ingestion`
          : 'All statements processed',
    };
  } catch (err) {
    return {
      status: 'fail',
      note: err instanceof Error ? err.message : 'xAPI check failed',
    };
  }
}

async function checkAiTools(): Promise<AIToolsHealth> {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [recentCount, recentErrors] = await Promise.all([
      prisma.aIToolResult.count({
        where: { createdAt: { gte: twentyFourHoursAgo } },
      }),
      prisma.workflowDiagnostic.count({
        where: {
          workflow: { startsWith: 'ai_' },
          status: { in: ['error', 'errored', 'failed'] },
          createdAt: { gte: twentyFourHoursAgo },
        },
      }),
    ]);

    // "queueDepth" here represents recent error volume vs. normal throughput.
    const status: SubsystemCheck['status'] =
      recentErrors > 20 ? 'fail' : recentErrors > 5 ? 'degraded' : 'ok';

    return {
      status,
      queueDepth: recentErrors,
      note: `${recentCount} runs in last 24h, ${recentErrors} errors`,
    };
  } catch (err) {
    return {
      status: 'fail',
      note: err instanceof Error ? err.message : 'AI tools check failed',
    };
  }
}

async function checkEmail(): Promise<EmailHealth> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return {
      status: 'degraded',
      backlog: 0,
      note: 'RESEND_API_KEY missing — outbound emails skipped',
    };
  }

  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Count email-related cron failures as a proxy for email backlog
    const emailCronFailures = await prisma.workflowDiagnostic.count({
      where: {
        workflow: { contains: 'email', mode: 'insensitive' },
        status: { in: ['error', 'errored', 'failed'] },
        createdAt: { gte: twentyFourHoursAgo },
      },
    });

    const status: SubsystemCheck['status'] =
      emailCronFailures > 5 ? 'fail' : emailCronFailures > 0 ? 'degraded' : 'ok';

    return {
      status,
      backlog: emailCronFailures,
      note: emailCronFailures > 0 ? `${emailCronFailures} email cron failures (24h)` : 'Email flowing',
    };
  } catch (err) {
    return {
      status: 'fail',
      note: err instanceof Error ? err.message : 'Email check failed',
    };
  }
}

async function checkEmailDelivery(): Promise<EmailDeliveryHealth> {
  const webhookConfigured = Boolean(process.env.RESEND_WEBHOOK_SECRET?.trim());
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [sent24h, failed24h, bounced24h, lastWebhook] = await Promise.all([
      prisma.emailSendLog.count({ where: { status: 'sent', createdAt: { gte: since } } }),
      prisma.emailSendLog.count({ where: { status: 'failed', createdAt: { gte: since } } }),
      prisma.emailSendLog.count({
        where: { lastEvent: { in: ['bounced', 'complained'] }, lastEventAt: { gte: since } },
      }),
      prisma.webhookEvent.findFirst({
        where: { source: 'resend', status: 'success' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    const notes: string[] = [`${sent24h} sent, ${failed24h} failed, ${bounced24h} bounced/complained (24h)`];
    let status: SubsystemCheck['status'] = 'ok';
    if (!webhookConfigured) {
      status = 'degraded';
      notes.push('RESEND_WEBHOOK_SECRET missing — delivery, bounce and complaint events are not received');
    } else if (!lastWebhook) {
      notes.push('no webhook delivery received yet');
    }
    if (failed24h > 5 || bounced24h > 5) status = 'fail';
    else if (failed24h > 0 || bounced24h > 0) status = 'degraded';

    return {
      status,
      sent24h,
      failed24h,
      bounced24h,
      webhookConfigured,
      lastWebhookAt: lastWebhook?.createdAt.toISOString() ?? null,
      note: notes.join(' · '),
    };
  } catch (err) {
    return {
      status: 'fail',
      webhookConfigured,
      note: err instanceof Error ? err.message : 'Email delivery check failed',
    };
  }
}

async function checkDiscordNotifications(): Promise<DiscordHealth> {
  const configured = Boolean(process.env.DISCORD_NOTIFICATIONS_WEBHOOK_URL);
  if (!configured) {
    return { status: 'ok', configured, note: 'Discord bridge not configured (optional)' };
  }
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [errors24h, dropped24h] = await Promise.all([
      prisma.workflowDiagnostic.count({
        where: { workflow: 'discord_notification', status: { in: ['error', 'errored', 'failed'] }, createdAt: { gte: since } },
      }),
      prisma.workflowDiagnostic.count({
        where: { workflow: 'discord_notification', status: 'fallback', createdAt: { gte: since } },
      }),
    ]);
    const status: SubsystemCheck['status'] = errors24h > 10 ? 'fail' : errors24h > 0 || dropped24h > 0 ? 'degraded' : 'ok';
    return {
      status,
      configured,
      errors24h,
      dropped24h,
      note: errors24h + dropped24h > 0
        ? `${errors24h} failed posts, ${dropped24h} rate-limit drops (24h)`
        : 'Posting normally',
    };
  } catch (err) {
    return { status: 'fail', configured, note: err instanceof Error ? err.message : 'Discord check failed' };
  }
}

async function checkWebPush(): Promise<WebPushHealth> {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY && process.env.WEB_PUSH_VAPID_PRIVATE_KEY,
  );
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [subscriptions, errors24h] = await Promise.all([
      prisma.pushSubscription.count(),
      prisma.workflowDiagnostic.count({
        where: { workflow: 'web_push', status: { in: ['error', 'errored', 'failed'] }, createdAt: { gte: since } },
      }),
    ]);
    if (!configured) {
      return {
        status: 'ok',
        configured,
        subscriptions,
        errors24h,
        note: 'VAPID keys not set — web push is inert (optional)',
      };
    }
    const status: SubsystemCheck['status'] = errors24h > 10 ? 'fail' : errors24h > 0 ? 'degraded' : 'ok';
    return {
      status,
      configured,
      subscriptions,
      errors24h,
      note: `${subscriptions} subscriptions, ${errors24h} send errors (24h)`,
    };
  } catch (err) {
    return { status: 'fail', configured, note: err instanceof Error ? err.message : 'Web push check failed' };
  }
}

/* ─── Route handlers ─── */

async function _GET(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!(await isAdmin(user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const startedAt = new Date();
    if (isReadOnlyPortalAuditHeader(request.headers)) {
      const suppressed = { status: 'degraded' as const, note: 'Provider check suppressed during read-only audit' };
      const body: HealthResponse = {
        status: 'degraded',
        checks: {
          database: suppressed,
          redis: suppressed,
          prisma: suppressed,
          cronJobs: suppressed,
          webhooks: suppressed,
          xapi: suppressed,
          aiTools: suppressed,
          email: suppressed,
          emailDelivery: suppressed,
          discordNotifications: suppressed,
          webPush: suppressed,
        },
        generatedAt: startedAt.toISOString(),
        auditSuppressed: true,
      };
      return NextResponse.json(body, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    const [
      database,
      redis,
      prismaCheck,
      cronJobs,
      webhooks,
      xapi,
      aiTools,
      email,
      emailDelivery,
      discordNotifications,
      webPush,
    ] = await Promise.all([
      checkDatabase(),
      checkRedis(),
      checkPrisma(),
      checkCronJobs(),
      checkWebhooks(),
      checkXapi(),
      checkAiTools(),
      checkEmail(),
      checkEmailDelivery(),
      checkDiscordNotifications(),
      checkWebPush(),
    ]);

    const checks: HealthChecks = {
      database,
      redis,
      prisma: prismaCheck,
      cronJobs,
      webhooks,
      xapi,
      aiTools,
      email,
      emailDelivery,
      discordNotifications,
      webPush,
    };

    // Overall status: fail if any critical subsystem is fail; degraded if any is degraded.
    const values = Object.values(checks);
    let overall: HealthStatus = 'healthy';
    if (values.some((c) => c.status === 'fail')) {
      overall = 'unhealthy';
    } else if (values.some((c) => c.status === 'degraded')) {
      overall = 'degraded';
    }

    const body: HealthResponse = {
      status: overall,
      checks,
      generatedAt: startedAt.toISOString(),
    };

    return NextResponse.json(body, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('/api/admin/health error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
export const GET = withApiGuc(_GET);
