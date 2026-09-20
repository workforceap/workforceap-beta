/**
 * Required-field summaries for portal forms.
 *
 * Audit 2026-09-20: several admin/counselor forms disabled their submit
 * button, or let the browser block the submit, without saying which field
 * was still empty. These helpers produce one short sentence naming the
 * missing fields so the form can render it next to the button (and point the
 * button at it via `aria-describedby`).
 *
 * Pure helpers first; the DOM reader at the bottom is for forms that keep
 * native `required` attributes but want an inline summary instead of the
 * browser tooltip.
 */

type RequiredFieldCheck = {
  /** Visible label, e.g. "First name". */
  label: string;
  /** True when the field is satisfied. */
  ok: boolean;
};

/** Labels of the checks that are not satisfied, in order. */
export function missingRequiredLabels(checks: readonly RequiredFieldCheck[]): string[] {
  return checks.filter((check) => !check.ok).map((check) => check.label);
}

/**
 * "Still needed: First name, Email." — or null when nothing is missing.
 * The lead-in can be replaced (e.g. "Before you can continue:").
 */
export function describeMissingRequired(
  labels: readonly string[],
  options: { leadIn?: string } = {},
): string | null {
  const unique = Array.from(new Set(labels.map((label) => label.trim()).filter(Boolean)));
  if (unique.length === 0) return null;
  const leadIn = options.leadIn ?? 'Still needed';
  return `${leadIn}: ${unique.join(', ')}.`;
}

/** Strip the required-marker and surrounding whitespace from a visible label. */
export function cleanFieldLabel(raw: string | null | undefined): string {
  return (raw ?? '')
    .replace(/\s*\*+\s*$/u, '')
    .replace(/\(required\)/iu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

type ValidatableControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function isValidatable(element: Element): element is ValidatableControl {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  );
}

/** Visible name for a control: its label, else aria-label, placeholder or name. */
export function fieldLabelFor(control: ValidatableControl): string {
  const fromLabel = control.labels && control.labels.length > 0 ? cleanFieldLabel(control.labels[0].textContent) : '';
  if (fromLabel) return fromLabel;
  const aria = cleanFieldLabel(control.getAttribute('aria-label'));
  if (aria) return aria;
  const labelledBy = control.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/u)
      .map((id) => control.ownerDocument.getElementById(id)?.textContent ?? '')
      .join(' ');
    const cleaned = cleanFieldLabel(text);
    if (cleaned) return cleaned;
  }
  const placeholder = cleanFieldLabel(control.getAttribute('placeholder'));
  if (placeholder) return placeholder;
  return cleanFieldLabel(control.name) || 'A required field';
}

/** Controls in the form that fail constraint validation, in DOM order. */
function invalidControls(form: HTMLFormElement): ValidatableControl[] {
  const out: ValidatableControl[] = [];
  for (const element of Array.from(form.elements)) {
    if (!isValidatable(element)) continue;
    if (element.disabled || !element.willValidate) continue;
    if (!element.validity.valid) out.push(element);
  }
  return out;
}

/** Labels of every control that fails constraint validation (deduplicated). */
export function collectInvalidFieldLabels(form: HTMLFormElement): string[] {
  return Array.from(new Set(invalidControls(form).map(fieldLabelFor)));
}

/** Focus the first invalid control so keyboard users land on the problem. */
export function focusFirstInvalid(form: HTMLFormElement): boolean {
  const [first] = invalidControls(form);
  if (!first) return false;
  first.focus();
  return true;
}
