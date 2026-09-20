'use client';

import { type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  /** Dialog body — plain text or richer markup. */
  body: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive and shows a warning icon. */
  danger?: boolean;
  /** Disables both buttons and swaps the confirm label while the action runs. */
  busy?: boolean;
  /** Prevent confirmation while leaving Cancel available. */
  confirmDisabled?: boolean;
  /** Dialog card max width in px. Defaults to 420 (previous hardcoded value). */
  maxWidth?: number;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Shared styled confirmation dialog for admin/portal flows — replaces native
 * `window.confirm()`. Built on the Astryx `Dialog` (native `<dialog>` with
 * built-in focus trap, Escape, backdrop dismiss, and focus restore) — same
 * external props API as the previous hand-rolled implementation, so the 16
 * existing consumers are unchanged. Astryx `AlertDialog` was considered but
 * requires a string description; `body` here is ReactNode by contract.
 */
export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  busy = false,
  confirmDisabled = false,
  maxWidth = 420,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog
      isOpen={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && !busy) onCancel();
      }}
      width={maxWidth}
      purpose="info"
      aria-label={title}
    >
      <VStack gap={3}>
        <DialogHeader
          title={title}
          startContent={
            danger ? <AlertTriangle size={20} style={{ color: 'var(--wa-danger, #dc2626)', flexShrink: 0 }} aria-hidden /> : undefined
          }
        />
        {typeof body === 'string' ? <Text color="secondary">{body}</Text> : body}
        <HStack gap={2} justify="end">
          <Button label={cancelLabel} variant="ghost" onClick={onCancel} isDisabled={busy} />
          <Button
            label={busy ? 'Working…' : confirmLabel}
            variant={danger ? 'destructive' : 'primary'}
            onClick={onConfirm}
            isDisabled={busy || confirmDisabled}
            isLoading={busy}
          />
        </HStack>
      </VStack>
    </Dialog>
  );
}
