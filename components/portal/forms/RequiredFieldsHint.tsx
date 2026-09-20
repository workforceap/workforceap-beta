import { describeMissingRequired } from '@/lib/forms/requiredFields';

/**
 * One-line "Still needed: First name, Email." hint for a form whose submit
 * button is disabled until required fields are filled. Render it next to the
 * button and point the button at it with `aria-describedby={id}` so screen
 * readers hear why the control is disabled. Renders nothing when complete.
 *
 * Audit 2026-09-20: Add Member step 1, walk-in intake and several admin
 * create forms disabled submit with no explanation.
 */
export function RequiredFieldsHint({
  id,
  labels,
  leadIn,
  className,
}: {
  id: string;
  labels: readonly string[];
  leadIn?: string;
  className?: string;
}) {
  const text = describeMissingRequired(labels, leadIn ? { leadIn } : undefined);
  if (!text) return null;
  return (
    <p id={id} role="status" className={['wa-required-hint', className].filter(Boolean).join(' ')}>
      {text}
    </p>
  );
}

export default RequiredFieldsHint;
