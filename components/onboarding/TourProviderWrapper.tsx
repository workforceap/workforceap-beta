'use client';

import { Suspense } from 'react';
import { TourProvider } from './TourContext';
import TourAutoStart from './TourAutoStart';
import { GuidedTour } from '@/components/portal/kit/GuidedTour';

export default function TourProviderWrapper({ children }: { children: React.ReactNode }) {
  return (
    <TourProvider>
      {children}
      <GuidedTour />
      <Suspense fallback={null}>
        <TourAutoStart />
      </Suspense>
    </TourProvider>
  );
}
