import React, { useEffect, useRef } from 'react';

interface AsciiBackgroundProps {
  isDarkMode: boolean;
}

export function AsciiBackground({ isDarkMode }: AsciiBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let lastTime = 0;
    
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resizeCanvas();

    const resizeObserver = new ResizeObserver(() => {
      resizeCanvas();
    });
    
    // Watch parent or body
    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    } else {
      window.addEventListener('resize', resizeCanvas);
    }

    // Characters to rain down: combination of ChatPPT letters, binary, and code syntax
    const chars = 'CHATPPT01{}[];:<>_+=/*!@#$%^&*()-Pixel';
    const charArr = chars.split('');

    const fontSize = 14;
    let columns = Math.floor(canvas.width / fontSize);

    interface ColumnState {
      y: number;
      speed: number;
      opacity: number;
      charIndex: number;
      hue: string;
    }
    
    let streams: ColumnState[] = [];

    const initStreams = (cols: number) => {
      streams = Array(cols).fill(0).map((_, i) => {
        // Stagger starting positions widely to decrease screen density and flashiness
        const startY = Math.random() * -120;
        const speed = 0.04 + Math.random() * 0.08; // Extremely slow, elegant crawl
        const opacity = 0.08 + Math.random() * 0.12; // Gentle and eye-safe contrast
        
        // Fixed stable color hue per stream (rather than random frame-by-frame)
        // Alternate between soft dark indigo and violet/magenta tints
        const hue = i % 3 === 0 
          ? '139, 92, 246'  // violet
          : i % 3 === 1 
            ? '99, 102, 241' // indigo
            : '236, 72, 153'; // soft pink highlight
            
        return {
          y: startY,
          speed,
          opacity,
          charIndex: Math.floor(Math.random() * charArr.length),
          hue
        };
      });
    };

    initStreams(columns);

    const draw = (timestamp: number) => {
      animationFrameId = requestAnimationFrame(draw);

      if (!lastTime) lastTime = timestamp;
      const elapsed = timestamp - lastTime;
      
      // Throttle update cycle slightly to make ticks smooth and consistent
      if (elapsed < 24) return;
      lastTime = timestamp;

      // Create a super smooth trailing face fade
      ctx.fillStyle = isDarkMode ? 'rgba(15, 15, 15, 0.15)' : 'rgba(247, 245, 242, 0.15)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.font = `${fontSize}px "JetBrains Mono", Courier, monospace`;

      for (let i = 0; i < streams.length; i++) {
        const stream = streams[i];
        
        // Gently change individual characters occasionally for visual variety
        if (Math.random() > 0.99) {
          stream.charIndex = Math.floor(Math.random() * charArr.length);
        }
        const char = charArr[stream.charIndex];

        // Draw stream in stable, high eye-safety palettes
        if (isDarkMode) {
          ctx.fillStyle = `rgba(${stream.hue}, ${stream.opacity})`;
        } else {
          // Low-opacity gray/slate streams in light mode
          ctx.fillStyle = `rgba(148, 163, 184, ${stream.opacity})`;
        }

        // Render current character drop
        ctx.fillText(char, i * fontSize, Math.floor(stream.y) * fontSize);

        // Move water stream down very smoothly and slowly
        stream.y += stream.speed;

        // Reset drop with slow start staggered above view once fully out
        if (stream.y * fontSize > canvas.height) {
          stream.y = Math.random() * -30;
          stream.speed = 0.04 + Math.random() * 0.08;
          stream.opacity = 0.08 + Math.random() * 0.12;
        }
      }
    };

    const checkColumns = () => {
      const currentCols = Math.floor(canvas.width / fontSize);
      if (currentCols !== columns) {
        columns = currentCols;
        initStreams(columns);
      }
    };

    // Periodically sync columns configuration gently
    const intervalId = setInterval(checkColumns, 4000);

    draw(0);

    return () => {
      cancelAnimationFrame(animationFrameId);
      clearInterval(intervalId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [isDarkMode]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none z-0"
      style={{ mixBlendMode: 'normal' }}
    />
  );
}
