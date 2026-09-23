'use client';

import { useRef, useState } from 'react';
import { MessageSquareText } from 'lucide-react';
import MemberFeedbackModal from './MemberFeedbackModal';

/**
 * Opens the member feedback dialog (POST /api/member/feedback). A kit ghost
 * pill with a Lucide icon, so it can sit on default kit pages
 * (/dashboard/help) as well as the legacy home and profile.
 */
export default function MemberFeedbackButton() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none"
      >
        <MessageSquareText size={18} aria-hidden="true" />
        Share feedback
      </button>
      <MemberFeedbackModal
        open={open}
        onClose={() => {
          setOpen(false);
          // Return focus to the button that opened the dialog instead of
          // letting it fall back to <body> when the modal unmounts.
          triggerRef.current?.focus();
        }}
      />
    </>
  );
}
