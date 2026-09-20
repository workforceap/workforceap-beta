import { describe, expect, it } from 'vitest';
import { collectInvalidFieldLabels, fieldLabelFor, focusFirstInvalid } from '@/lib/forms/requiredFields';

function buildForm(html: string): HTMLFormElement {
  document.body.innerHTML = `<form novalidate>${html}</form>`;
  return document.querySelector('form') as HTMLFormElement;
}

describe('collectInvalidFieldLabels', () => {
  it('names each empty required control after its visible label, without the asterisk', () => {
    const form = buildForm(`
      <label for="name">Name *</label><input id="name" required value="" />
      <label for="type">Type *</label><select id="type"><option value="partner">Partner</option></select>
      <label for="leader">Leader *</label><select id="leader" required><option value="">Select leader</option></select>
      <label for="notes">Notes</label><textarea id="notes"></textarea>
    `);
    expect(collectInvalidFieldLabels(form)).toEqual(['Name', 'Leader']);
  });

  it('reports a malformed email and skips disabled controls', () => {
    const form = buildForm(`
      <label for="email">Contact email *</label><input id="email" type="email" required value="not-an-email" />
      <label for="off">Ignored *</label><input id="off" required disabled value="" />
    `);
    expect(collectInvalidFieldLabels(form)).toEqual(['Contact email']);
  });

  it('falls back to aria-label, then placeholder, when there is no label element', () => {
    const form = buildForm(`
      <input aria-label="User ID" required value="" />
      <input placeholder="Full name" required value="" />
      <input name="slug" required value="" />
    `);
    expect(collectInvalidFieldLabels(form)).toEqual(['User ID', 'Full name', 'slug']);
    const [first] = Array.from(form.elements) as HTMLInputElement[];
    expect(fieldLabelFor(first)).toBe('User ID');
  });

  it('focuses the first invalid control', () => {
    const form = buildForm(`
      <label for="a">A</label><input id="a" value="ok" required />
      <label for="b">B *</label><input id="b" required value="" />
    `);
    expect(focusFirstInvalid(form)).toBe(true);
    expect(document.activeElement).toBe(form.querySelector('#b'));
  });

  it('returns nothing when the form is valid', () => {
    const form = buildForm(`<label for="x">X</label><input id="x" required value="filled" />`);
    expect(collectInvalidFieldLabels(form)).toEqual([]);
    expect(focusFirstInvalid(form)).toBe(false);
  });
});
