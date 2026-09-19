'use client';

import type { ClientEventName } from './names';

export type MemberEventRequest = {
  eventName: ClientEventName;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  sourcePage?: string;
  sessionId?: string;
};

export async function postMemberEvent(payload: MemberEventRequest): Promise<void> {
  try {
    await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // Best-effort analytics only.
  }
}
