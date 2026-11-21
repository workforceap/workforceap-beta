'use client';

import { ProgressBar } from '@astryxdesign/core/ProgressBar';

/** Kit bar for one WAPAT section. The row's text stays the accessible name. */
export default function WapatScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <ProgressBar
      label={`${label} score`}
      isLabelHidden
      value={value}
      max={100}
      variant="accent"
    />
  );
}
