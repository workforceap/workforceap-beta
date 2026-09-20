import { afterAll, beforeAll } from 'vitest';

/**
 * JSDOM has no `HTMLDialogElement.showModal()`/`close()`. Astryx `Dialog`
 * calls both, so component specs that open one install this stub. It keeps
 * the real element, events and focus restoration; only opening/closing is
 * emulated (Tab containment stays a browser acceptance check).
 */
export function installNativeDialogStub() {
  const methods = ['showModal', 'close'] as const;
  const originals = methods.map((name) => Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name));

  beforeAll(() => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
        this.querySelector<HTMLElement>('h2')?.focus();
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.removeAttribute('open');
      },
    });
  });

  afterAll(() => {
    methods.forEach((name, index) => {
      const original = originals[index];
      if (original) Object.defineProperty(HTMLDialogElement.prototype, name, original);
      else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
    });
  });
}
