'use client';

import { useEffect, useRef } from 'react';

export default function PhaserGame() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;

    // Dynamically import Phaser + game (client-side only)
    import('../game/main.js').then(({ createGame }) => {
      if (containerRef.current && !gameRef.current) {
        gameRef.current = createGame(containerRef.current);
      }
    });

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  return (
    <div
      id="phaser-container"
      ref={containerRef}
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000',
        overflow: 'hidden',
      }}
    />
  );
}
