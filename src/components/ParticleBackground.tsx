import React, { useEffect, useRef } from 'react';

export const ParticleBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);

    // Particles setup
    const particlesCount = 240;
    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      baseSize: number;
      size: number;
      opacity: number;
      color: 'white' | 'neon';
    }> = [];

    for (let i = 0; i < particlesCount; i++) {
      const isNeon = Math.random() < 0.25; // 25% stylish green emerald particles
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        baseSize: Math.random() * 1.6 + 0.4,
        size: 0,
        opacity: Math.random() * 0.35 + 0.08,
        color: isNeon ? 'neon' : 'white',
      });
    }

    // Mouse tracker
    let mouseX = -1000;
    let mouseY = -1000;

    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };

    const handleMouseLeave = () => {
      mouseX = -1000;
      mouseY = -1000;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);

    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      // Faint network/constellation connections between nearby particles
      for (let i = 0; i < particles.length; i++) {
        const p1 = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 55) {
            const connOpacity = (1 - dist / 55) * 0.04;
            ctx.strokeStyle = p1.color === 'neon' || p2.color === 'neon'
              ? `rgba(0, 255, 157, ${connOpacity * 1.6})`
              : `rgba(255, 255, 255, ${connOpacity})`;
            ctx.lineWidth = 0.35;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        }
      }

      // Render star/galaxy particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;

        // Wrap boundaries
        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        // Mouse proximity calculation
        const dx = mouseX - p.x;
        const dy = mouseY - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        let currentSize = p.baseSize;
        let currentOpacity = p.opacity;

        if (dist < 150) {
          const factor = (150 - dist) / 150;
          currentSize = p.baseSize * (1 + factor * 2.5);
          currentOpacity = Math.min(0.8, p.opacity + factor * 0.5);

          // Draw a very faint line connecting to mouse
          ctx.strokeStyle = `rgba(0, 255, 157, ${factor * 0.15})`;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(mouseX, mouseY);
          ctx.stroke();
        }

        if (p.color === 'neon') {
          ctx.fillStyle = `rgba(0, 255, 157, ${currentOpacity})`;
        } else {
          ctx.fillStyle = `rgba(255, 255, 255, ${currentOpacity})`;
        }
        
        ctx.beginPath();
        ctx.arc(p.x, p.y, currentSize, 0, Math.PI * 2);
        ctx.fill();

        // Draw ambient glow for larger ones or when mouse hovers near
        if (dist < 150) {
          ctx.fillStyle = `rgba(0, 255, 157, ${currentOpacity * 0.2})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, currentSize * 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ mixBlendMode: 'screen' }}
    />
  );
};
