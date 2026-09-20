'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent, LayoutFooter, HStack, VStack } from '@astryxdesign/core/Layout';
import { Button } from '@astryxdesign/core/Button';
import { Text } from '@astryxdesign/core/Text';

type Props = {
  partner: { id: string; name: string; _count?: { referrals: number } };
  partners: { id: string; name: string; active: boolean }[];
  onClose: () => void;
};

export default function PartnerDeactivateDialog({ partner, partners, onClose }: Props) {
  const router = useRouter();
  const [reassignToPartnerId, setReassignToPartnerId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activePartners = partners.filter((p) => p.active && p.id !== partner.id);
  const referralCount = partner._count?.referrals ?? 0;
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen && !loading) onClose();
  };

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/partners/${partner.id}/deactivate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reassignToPartnerId: reassignToPartnerId || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Failed to deactivate');
        return;
      }
      router.refresh();
      onClose();
    } catch {
      setError('Request failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog isOpen onOpenChange={handleOpenChange} purpose="form" width={480} aria-label="Deactivate Partner">
      <Layout
        header={
          <DialogHeader
            title="Deactivate Partner"
            startContent={<AlertTriangle size={20} style={{ color: 'var(--wa-danger)', flexShrink: 0 }} aria-hidden />}
            onOpenChange={loading ? undefined : handleOpenChange}
          />
        }
        content={
          <LayoutContent>
            <VStack gap={3}>
              <Text color="secondary">
                This will prevent <strong>{partner.name}</strong> from accessing the partner portal. Their data will be preserved.
              </Text>

              {referralCount > 0 && activePartners.length > 0 && (
                <div style={{ padding: '0.75rem', background: 'var(--wa-surface-2)', borderRadius: 'var(--wa-radius-sm)' }}>
                  <label htmlFor="partner-deactivate-reassign" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, fontSize: '0.9rem' }}>
                    Reassign their {referralCount} referred member{referralCount !== 1 ? 's' : ''} to another partner
                  </label>
                  <select
                    id="partner-deactivate-reassign"
                    value={reassignToPartnerId}
                    onChange={(e) => setReassignToPartnerId(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid var(--outline-variant)', borderRadius: '6px' }}
                    disabled={loading}
                  >
                    <option value="">— Don&rsquo;t reassign —</option>
                    {activePartners.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  style={{
                    padding: '0.75rem',
                    background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
                    borderRadius: '6px',
                    color: 'var(--color-accent)',
                    fontSize: '0.9rem',
                  }}
                >
                  {error}
                </div>
              )}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} justify="end">
              <Button type="button" label="Cancel" variant="ghost" onClick={onClose} isDisabled={loading} />
              <Button
                type="button"
                label={loading ? 'Deactivating…' : 'Deactivate'}
                variant="destructive"
                onClick={() => void handleConfirm()}
                isDisabled={loading}
                isLoading={loading}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
