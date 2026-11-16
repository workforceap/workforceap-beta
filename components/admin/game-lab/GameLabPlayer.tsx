'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The iframe (and with it the WebGL context and render loop) exists only after
 * an explicit Launch, and is removed again on Exit.
 */
export default function GameLabPlayer({ slug, title }: { slug: string; title: string }) {
  const router = useRouter();
  const [launched, setLaunched] = useState(false);

  function exit() {
    setLaunched(false);
    router.push('/admin/game-lab');
  }

  return (
    <div className="game-lab-player">
      <div style={{ marginBottom: '0.75rem' }}>
        {launched ? (
          <button type="button" className="btn btn-outline btn-sm" onClick={exit} data-testid="game-lab-exit">
            Exit
          </button>
        ) : (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setLaunched(true)} data-testid="game-lab-launch">
            Launch {title}
          </button>
        )}
      </div>
      {launched ? (
        <iframe
          title={title}
          src={`/api/admin/game-lab/${slug}/index.html`}
          data-testid="game-lab-frame"
          style={{ width: '100%', height: 'min(80vh, 760px)', minHeight: 520, border: '1px solid #d0d5dd', borderRadius: 8, background: '#000' }}
        />
      ) : (
        <p data-testid="game-lab-idle">Nothing is loaded until you press Launch.</p>
      )}
    </div>
  );
}
