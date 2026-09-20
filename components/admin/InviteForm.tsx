'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent, LayoutFooter, HStack } from '@astryxdesign/core/Layout';
import { Button } from '@astryxdesign/core/Button';

type InvitePostResponse = {
  ok?: boolean;
  emailSent?: boolean;
  inviteUrl?: string;
  warning?: string;
  error?: string;
};

type SubgroupOpt = { id: string; name: string };
type ProgramOpt = { slug: string; title: string };
type PartnerOpt = { id: string; name: string };

type Props = {
  subgroups: SubgroupOpt[];
  programs: ProgramOpt[];
  partners: PartnerOpt[];
  onClose: () => void;
};

export default function InviteForm({ subgroups, programs, partners, onClose }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'partner' | 'member' | 'counselor'>('member');
  const [subgroupId, setSubgroupId] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [counselorAffiliation, setCounselorAffiliation] = useState<'wap_staff' | 'partner' | 'independent' | 'community_ambassador'>('wap_staff');
  const [programSlug, setProgramSlug] = useState('');
  const [personalMessage, setPersonalMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualLink, setManualLink] = useState<{ url: string; message: string } | null>(null);
  const [copied, setCopied] = useState(false);
  // Parent mounts this component only while the modal is open; the Astryx
  // Dialog (native <dialog>) owns the scrim, focus trap, Escape and --z-*
  // stacking (WAP-137). Dismissal is blocked while a request is in flight.
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !sending) onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    setManualLink(null);
    try {
      const res = await fetch('/api/admin/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          role,
          subgroupId: role === 'partner' && subgroupId ? subgroupId : null,
          partnerId: role === 'counselor' && counselorAffiliation === 'partner' && partnerId ? partnerId : null,
          counselorAffiliation: role === 'counselor' ? counselorAffiliation : null,
          programSlug: role === 'member' && programSlug ? programSlug : null,
          personalMessage: personalMessage.trim() || null,
        }),
      });
      const data = (await res.json()) as InvitePostResponse;
      if (!res.ok) throw new Error(data.error ?? 'Failed to send invite');
      if (data.emailSent === false && data.inviteUrl && data.warning) {
        setManualLink({ url: data.inviteUrl, message: data.warning });
        router.refresh();
        setSending(false);
        return;
      }
      router.refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setSending(false);
    }
  };

  const copyManualLink = async () => {
    if (!manualLink) return;
    try {
      await navigator.clipboard.writeText(manualLink.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy — select the link and copy manually.');
    }
  };

  const inputStyle = {
    width: '100%',
    maxWidth: '100%',
    padding: '0.5rem 0.75rem',
    border: '1px solid var(--outline-variant)',
    borderRadius: '6px',
    fontSize: '1rem',
  } as const;
  const labelStyle = { display: 'block', marginBottom: '0.25rem', fontWeight: 500 } as const;

  return (
    <Dialog isOpen onOpenChange={handleOpenChange} purpose="form" width={480} maxHeight="90dvh" aria-label="Send Invite">
      <Layout
        header={<DialogHeader title="Send Invite" onOpenChange={sending ? undefined : handleOpenChange} />}
        content={
          <LayoutContent>
            <form id="admin-invite-form" onSubmit={handleSubmit} aria-busy={sending}>
            {error && (
              <div
                style={{
                  padding: '0.75rem',
                  marginBottom: '1rem',
                  background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
                  borderRadius: '6px',
                  color: 'var(--color-accent)',
                  fontSize: '0.9rem',
                }}
              >
                {error}
              </div>
            )}

            {manualLink && (
              <div
                role="status"
                style={{
                  padding: '0.75rem',
                  marginBottom: '1rem',
                  background: '#fff8e6',
                  border: '1px solid #e6c200',
                  borderRadius: '6px',
                  fontSize: '0.9rem',
                  color: '#5c4a00',
                }}
              >
                <p style={{ margin: '0 0 0.5rem' }}>{manualLink.message}</p>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <code
                    style={{
                      flex: '1 1 200px',
                      fontSize: '0.8125rem',
                      wordBreak: 'break-all',
                      background: 'white',
                      padding: '0.35rem 0.5rem',
                      borderRadius: '4px',
                      border: '1px solid #ddd',
                    }}
                  >
                    {manualLink.url}
                  </code>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => void copyManualLink()}>
                    <span aria-live="polite" style={{ display: 'inline-flex', alignItems: 'center' }}>
                      {copied ? (
                        <>
                          <span className="material-symbols-outlined" style={{ fontSize: '1rem', marginRight: '4px' }} aria-hidden="true">check</span>
                          Copied!
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined" style={{ fontSize: '1rem', marginRight: '4px' }} aria-hidden="true">content_copy</span>
                          Copy link
                        </>
                      )}
                    </span>
                  </button>
                </div>
                <p style={{ margin: '0.75rem 0 0', fontSize: '0.85rem' }}>
                  The invite is saved. Close when you&rsquo;re done, or configure <code>RESEND_API_KEY</code> and use
                  Resend on the list.
                </p>
              </div>
            )}

            <div style={{ marginBottom: '1rem' }}>
              <label htmlFor="invite-email" style={labelStyle}>
                Email address
              </label>
              <input
                id="invite-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@example.com"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label htmlFor="invite-role" style={labelStyle}>
                Role
              </label>
              <select
                id="invite-role"
                value={role}
                onChange={(e) => {
                  setRole(e.target.value as 'admin' | 'partner' | 'member' | 'counselor');
                  setSubgroupId('');
                  setPartnerId('');
                  setProgramSlug('');
                }}
                style={inputStyle}
              >
                <option value="admin">Admin</option>
                <option value="partner">Partner</option>
                <option value="member">Member</option>
                <option value="counselor">Counselor</option>
              </select>
            </div>

            {role === 'counselor' && (
              <div style={{ marginBottom: '1rem' }}>
                <label htmlFor="invite-counselor-affiliation" style={labelStyle}>
                  Counselor type
                </label>
                <select
                  id="invite-counselor-affiliation"
                  value={counselorAffiliation}
                  onChange={(e) =>
                    setCounselorAffiliation(
                      e.target.value as 'wap_staff' | 'partner' | 'independent' | 'community_ambassador',
                    )
                  }
                  style={inputStyle}
                >
                  <option value="wap_staff">WorkforceAP staff counselor</option>
                  <option value="community_ambassador">Community Ambassador</option>
                  <option value="partner">Partner-organisation counselor</option>
                  <option value="independent">Independent advisor</option>
                </select>
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginTop: '0.35rem' }}>
                  Community Ambassadors get a counselor sign-in and a login code, set up their counselor profile,
                  and see only the members you assign to them.
                </p>
              </div>
            )}

            {role === 'counselor' && counselorAffiliation === 'partner' && partners.length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <label htmlFor="invite-counselor-partner" style={labelStyle}>
                  Partner affiliation (for counselors)
                </label>
                <select
                  id="invite-counselor-partner"
                  value={partnerId}
                  onChange={(e) => setPartnerId(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">WorkforceAP (organization counselor)</option>
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginTop: '0.35rem' }}>
                  Leave as WorkforceAP for internal staff, or choose a partner for partner-affiliated counselors.
                </p>
              </div>
            )}

            {role === 'partner' && subgroups.length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <label htmlFor="invite-subgroup" style={labelStyle}>
                  Subgroup (for partners)
                </label>
                <select
                  id="invite-subgroup"
                  value={subgroupId}
                  onChange={(e) => setSubgroupId(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">None</option>
                  {subgroups.map((sg) => (
                    <option key={sg.id} value={sg.id}>
                      {sg.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {role === 'member' && programs.length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <label htmlFor="invite-program" style={labelStyle}>
                  Assign to program (for students)
                </label>
                <select
                  id="invite-program"
                  value={programSlug}
                  onChange={(e) => setProgramSlug(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">None</option>
                  {programs.map((p) => (
                    <option key={p.slug} value={p.slug}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ marginBottom: '1rem' }}>
              <label htmlFor="invite-message" style={labelStyle}>
                Personal message (optional)
              </label>
              <textarea
                id="invite-message"
                value={personalMessage}
                onChange={(e) => setPersonalMessage(e.target.value)}
                placeholder="Add a personal note to the invitation..."
                rows={3}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>
            </form>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <HStack gap={2} hAlign="end">
              <Button type="button" label={manualLink ? 'Done' : 'Cancel'} variant="secondary" isDisabled={sending} onClick={() => onClose()} />
              <Button type="submit" form="admin-invite-form" label={sending ? 'Sending...' : 'Send Invite'} variant="primary" isDisabled={sending || !!manualLink} />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
