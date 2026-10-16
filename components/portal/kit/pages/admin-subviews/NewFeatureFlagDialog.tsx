'use client';

import { useState } from 'react';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Button } from '@astryxdesign/core/Button';
import { NewFeatureFlagForm } from './FeatureFlagSettings';

/**
 * Opens the new-flag form in a modal (UI-23) so the registry page stays a
 * clean empty/table surface instead of a permanently expanded create card.
 */
export function NewFeatureFlagDialog({
  label = 'New flag',
  size = 'sm',
}: {
  label?: string;
  size?: 'sm' | 'md';
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        label={label}
        variant="primary"
        size={size}
        onClick={() => setOpen(true)}
      />
      {/* Mount only while open so the create form cannot steal labels from
          in-row rollout editors, and so closed pages stay free of dialog chrome. */}
      {open ? (
        <Dialog
          isOpen
          onOpenChange={setOpen}
          purpose="form"
          width={560}
          aria-label="New feature flag"
        >
          <DialogHeader title="New flag" />
          <NewFeatureFlagForm
            embedded
            onCreated={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        </Dialog>
      ) : null}
    </>
  );
}
