'use client';

import { useState } from 'react';
import { GAME_LAB_ARCADE_SAVE_PREFIX, GAME_LAB_SAVE_KEYS } from '@/lib/game-lab/manifest';

/** Removes only the Game Lab save keys from this browser. Nothing is sent anywhere. */
export default function GameLabResetProgress() {
  const [done, setDone] = useState(false);
  function reset() {
    try {
      for (const key of GAME_LAB_SAVE_KEYS) window.localStorage.removeItem(key);
      // Arcade games save one key per game id under this prefix, plus settings and last-played.
      const arcadeKeys = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key?.startsWith(GAME_LAB_ARCADE_SAVE_PREFIX)) arcadeKeys.push(key);
      }
      for (const key of arcadeKeys) window.localStorage.removeItem(key);
    } catch {
      /* storage blocked: nothing saved to clear */
    }
    setDone(true);
  }
  return (
    <div className="game-lab-reset" style={{ marginTop: '1rem' }}>
      <button type="button" className="btn btn-outline btn-sm" onClick={reset} data-testid="game-lab-reset">
        Reset game progress
      </button>{' '}
      <span role="status" data-testid="game-lab-reset-status">
        {done ? 'Game progress cleared in this browser.' : ''}
      </span>
    </div>
  );
}
