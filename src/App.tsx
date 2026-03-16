import { useEffect, useRef } from 'react';

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;
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
      ref={containerRef}
      style={{ width: '100%', height: '100%', minWidth: '1280px', minHeight: '720px', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', background: '#000' }}
    />
  );
}
