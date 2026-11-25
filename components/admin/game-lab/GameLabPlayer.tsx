'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Button } from '@astryxdesign/core/Button';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import styles from './GameLabPlayer.module.css';

/**
 * The iframe (and with it the WebGL context and render loop) exists only after
 * an explicit Launch, and is removed again on Exit.
 *
 * A launched game runs in a fullscreen native modal dialog (browser top layer),
 * so the fixed WAP header and mobile bottom nav can never cover game controls
 * and there is no outer scroll trap. The Exit button always unmounts the frame.
 * Escape exits only while focus is in the WAP page: once focus moves into the
 * game iframe, its key events stay inside the frame and never reach this page.
 */
export default function GameLabPlayer({ slug, title }: { slug: string; title: string }) {
  const router = useRouter();
  const [launched, setLaunched] = useState(false);

  function exit() {
    setLaunched(false);
    router.push('/admin/game-lab');
  }

  return (
    <>
      <Button label={`Launch ${title}`} variant="primary" onClick={() => setLaunched(true)} data-testid="game-lab-launch" />
      {launched ? (
        <Dialog
          isOpen
          variant="fullscreen"
          purpose="form"
          onOpenChange={(open) => {
            if (!open) exit();
          }}
          className={styles.dialog}
          data-testid="game-lab-dialog"
        >
          <Layout
            header={
              <DialogHeader
                title={title}
                hasDivider
                endContent={<Button label="Exit" onClick={exit} data-testid="game-lab-exit" />}
              />
            }
            content={
              <LayoutContent padding={0}>
                <iframe
                  title={title}
                  src={`/api/admin/game-lab/${slug}/index.html`}
                  data-testid="game-lab-frame"
                  className={styles.frame}
                />
              </LayoutContent>
            }
          />
        </Dialog>
      ) : null}
    </>
  );
}
