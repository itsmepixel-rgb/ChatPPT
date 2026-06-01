// Code-based Vector Background Generator for ChatPPT
// Generates stunning CSS mesh gradients, patterns, grids, and geometric SVG aesthetics procedural/on-the-fly.

export interface ProceduralBgPreset {
  id: string;
  name: string;
  description: string;
  style: string;
}

// Custom curated cohesive palettes for randomizing mesh colors
const PALETTES = {
  cosmic: ['#09090b', '#1e1b4b', '#311042', '#3b0764', '#1d4ed8', '#06b6d4'],
  sunset: ['#fafaf9', '#fef3c7', '#ffedd5', '#ffe4e6', '#ffe4d6', '#fed7aa', '#f43f5e', '#ec4899'],
  forest: ['#042f1a', '#064e3b', '#022c22', '#0f766e', '#115e59', '#14b8a6', '#10b981'],
  nordic: ['#0f172a', '#1e293b', '#334155', '#475569', '#cbd5e1', '#06b6d4', '#e2e8f0'],
  cyberpunk: ['#030712', '#0f0525', '#1e0524', '#0c1a21', '#db2777', '#7c3aed', '#0891b2', '#f43f5e'],
  warmOchre: ['#fdfdfc', '#f5f5f4', '#fafaf9', '#eddcd2', '#fff0f5', '#fff5eb', '#ffe5d9', '#d8b4f8'],
  vaporwave: ['#110c22', '#221535', '#4d1c44', '#db2777', '#9333ea', '#2563eb', '#06b6d4', '#10b981'],
  lavender: ['#fafafb', '#f5f3ff', '#ede9fe', '#ddd6fe', '#c084fc', '#a78bfa', '#818cf8', '#6366f1']
};

export const INSTANT_TEMPLATES = [
  {
    id: 'aura_sparkles_dark',
    name: '✨ Silk Sparkle Dark',
    description: 'Breathtaking flowing curved light streams with magical twinkling star sparkles.',
    style: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1440 900' width='100%' height='100%' preserveAspectRatio='none'><rect width='1440' height='900' fill='%2305050f'/><defs><linearGradient id='aurag1' x1='0' y1='0' x2='1' y2='1'><stop offset='0%25' stop-color='%231e40af' stop-opacity='0.4'/><stop offset='50%25' stop-color='%23a855f7' stop-opacity='0.25'/><stop offset='100%25' stop-color='%2306b6d4' stop-opacity='0.05'/></linearGradient><linearGradient id='aurag2' x1='1' y1='0' x2='0' y2='1'><stop offset='0%25' stop-color='%2306b6d4' stop-opacity='0.6'/><stop offset='60%25' stop-color='%233b82f6' stop-opacity='0.2'/><stop offset='100%25' stop-color='%23ec4899' stop-opacity='0'/></linearGradient><g id='sparkle'><path d='M0 -15 Q0 0 15 0 Q0 0 0 15 Q0 0 -15 0 Q0 0 0 -15 Z' fill='%23ffffff'/></g><g id='sparkle-gold'><path d='M0 -8 Q0 0 8 0 Q0 0 0 8 Q0 0 -8 0 Q0 0 0 -8 Z' fill='%23fef08a'/></g></defs><path d='M-100 450 C 400 150, 1000 750, 1540 350 L 1540 900 L -100 900 Z' fill='url(%23aurag1)'/><path d='M-100 480 C 400 180, 1000 780, 1540 380' fill='none' stroke='url(%23aurag2)' stroke-width='4' opacity='0.7'/><path d='M-100 420 C 450 120, 950 720, 1540 320' fill='none' stroke='%2306b6d4' stroke-width='1.5' opacity='0.5'/><use href='%23sparkle' x='200' y='280' opacity='0.8' transform='scale(0.8)'/><use href='%23sparkle-gold' x='350' y='380' opacity='0.6' transform='scale(1.2)'/><use href='%23sparkle' x='650' y='180' opacity='0.9' transform='scale(1.1)'/><use href='%23sparkle-gold' x='800' y='520' opacity='0.7' transform='scale(0.6)'/><use href='%23sparkle' x='1100' y='290' opacity='0.8' transform='scale(1)'/><use href='%23sparkle' x='1250' y='460' opacity='0.85' transform='scale(0.95)'/><use href='%23sparkle-gold' x='140' y='600' opacity='0.5' transform='scale(0.8)'/><use href='%23sparkle' x='980' y='680' opacity='0.75' transform='scale(1.3)'/><use href='%23sparkle-gold' x='520' y='740' opacity='0.4' transform='scale(1)'/><path d='M-100 350 C 250 550, 1190 150, 1540 550' fill='none' stroke='%23ffffff' stroke-width='1' stroke-dasharray='15,8' opacity='0.25'/></svg>")`
  },
  {
    id: 'silk_splines_cosmic',
    name: '🎮 Silk Cosmic Ribbon',
    description: 'Nostalgic glowing wavy spline ribbons flowing on a cosmic canvas.',
    style: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1440 900' width='100%' height='100%' preserveAspectRatio='none'><rect width='1440' height='900' fill='%2306060c'/><defs><linearGradient id='g1' x1='0' y1='0' x2='1' y2='1'><stop offset='0%25' stop-color='%236366f1' stop-opacity='0.4'/><stop offset='50%25' stop-color='%23db2777' stop-opacity='0.15'/><stop offset='100%25' stop-color='%2306b6d4' stop-opacity='0.05'/></linearGradient><linearGradient id='g2' x1='1' y1='0' x2='0' y2='1'><stop offset='0%25' stop-color='%2306b6d4' stop-opacity='0.5'/><stop offset='50%25' stop-color='%236366f1' stop-opacity='0.2'/><stop offset='100%25' stop-color='%23db2777' stop-opacity='0'/></linearGradient></defs><path d='M0 350 C 350 150, 1050 750, 1440 550 Q 1050 850, 0 850 Z' fill='url(%23g1)'/><path d='M0 380 C 350 180, 1050 780, 1440 580' fill='none' stroke='url(%23g2)' stroke-width='6' opacity='0.7'/><path d='M0 340 C 400 100, 1000 800, 1440 500' fill='none' stroke='%2306b6d4' stroke-width='1.5' opacity='0.5'/><path d='M0 450 C 300 250, 1100 650, 1440 450' fill='none' stroke='%23db2777' stroke-width='2' opacity='0.4'/><path d='M0 250 C 500 500, 940 200, 1440 600' fill='none' stroke='%236366f1' stroke-width='3' stroke-dasharray='5,5' opacity='0.3'/></svg>")`
  },
  {
    id: 'silk_splines_lava',
    name: '🔥 Silk Solar Wave',
    description: 'Hot crimson, gold and apricot flowing bezier curves.',
    style: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1440 900' width='100%' height='100%' preserveAspectRatio='none'><rect width='1440' height='900' fill='%230f0404'/><defs><linearGradient id='sol1' x1='0' y1='0' x2='1' y2='1'><stop offset='0%25' stop-color='%23ea580c' stop-opacity='0.35'/><stop offset='50%25' stop-color='%23e11d48' stop-opacity='0.15'/><stop offset='100%25' stop-color='%23fbbf24' stop-opacity='0.05'/></linearGradient><linearGradient id='sol2' x1='1' y1='0' x2='0' y2='1'><stop offset='0%25' stop-color='%23fbbf24' stop-opacity='0.6'/><stop offset='50%25' stop-color='%23e11d48' stop-opacity='0.25'/><stop offset='100%25' stop-color='%23ea580c' stop-opacity='0'/></linearGradient></defs><path d='M0 450 C 450 150, 990 750, 1440 380 Q 990 850, 0 850 Z' fill='url(%23sol1)'/><path d='M0 480 C 450 180, 990 780, 1440 410' fill='none' stroke='url(%23sol2)' stroke-width='8' opacity='0.8'/><path d='M0 420 C 500 120, 940 720, 1440 350' fill='none' stroke='%23fbbf24' stroke-width='2' opacity='0.7'/><path d='M0 520 C 350 320, 1090 520, 1440 320' fill='none' stroke='%23e11d48' stroke-width='3' stroke-dasharray='12,6' opacity='0.4'/></svg>")`
  },
  {
    id: 'mesh_cosmic',
    name: '🌌 Cosmic Mesh',
    description: 'Deep space aesthetic with glowing blue, purple and cyan nebulas.',
    style: 'radial-gradient(at 10% 20%, rgba(30, 27, 75, 0.8) 0px, transparent 50%), radial-gradient(at 90% 10%, rgba(59, 7, 100, 0.7) 0px, transparent 50%), radial-gradient(at 50% 80%, rgba(29, 78, 216, 0.6) 0px, transparent 65%), radial-gradient(at 80% 90%, rgba(6, 182, 212, 0.5) 0px, transparent 40%), linear-gradient(135deg, #09090b 0%, #111115 100%)'
  },
  {
    id: 'dot_grid_dark',
    name: '📐 Tech Grid',
    description: 'Clean engineer dot coordinates with centeral indigo highlight.',
    style: 'radial-gradient(circle at 50% 50%, rgba(99, 102, 241, 0.15) 0%, transparent 60%), radial-gradient(circle, rgba(255, 255, 255, 0.08) 1px, transparent 1px) 0 0 / 24px 24px, #09090b'
  },
  {
    id: 'cyber_grid_mesh',
    name: '🕶️ Retro Cyberpunk',
    description: 'Faded glowing grid pattern backed by retro deep neon shadows.',
    style: 'linear-gradient(rgba(219, 39, 119, 0.04) 1px, transparent 1px) 0 0 / 32px 32px, linear-gradient(90deg, rgba(219, 39, 119, 0.04) 1px, transparent 1px) 0 0 / 32px 32px, radial-gradient(circle at 50% 20%, rgba(124, 58, 237, 0.25) 0%, transparent 70%), #030712'
  },
  {
    id: 'mesh_lavender',
    name: '🪻 Soft Lavender',
    description: 'Bright minimal interface with dreamy lavender and soft indigo gradients.',
    style: 'radial-gradient(at 20% 20%, rgba(192, 132, 252, 0.45) 0px, transparent 50%), radial-gradient(at 85% 15%, rgba(129, 140, 248, 0.4) 0px, transparent 45%), radial-gradient(at 40% 75%, rgba(245, 243, 255, 1) 0px, transparent 60%), radial-gradient(at 80% 80%, rgba(221, 214, 254, 0.6) 0px, transparent 50%), linear-gradient(135deg, #fafafb 0%, #f3f4f6 100%)'
  },
  {
    id: 'sand_dune',
    name: '🏜️ Sandy Minimal',
    description: 'Warm cream, apricot, and peach-infused organic smooth gradient.',
    style: 'radial-gradient(at 5% 5%, rgba(254, 215, 170, 0.6) 0px, transparent 45%), radial-gradient(at 95% 45%, rgba(254, 243, 199, 0.7) 0px, transparent 50%), radial-gradient(at 40% 85%, rgba(255, 228, 214, 0.8) 0px, transparent 60%), linear-gradient(to bottom right, #fdfdfc, #fafaf9)'
  },
  {
    id: 'nordic_clean',
    name: '🏔️ Nordic Cold',
    description: 'Ultra professional cold steel grey grid pattern with faint cyan aura.',
    style: 'radial-gradient(circle, rgba(15, 23, 42, 0.03) 1px, transparent 1px) 0 0 / 20px 20px, linear-gradient(135deg, rgba(6, 182, 212, 0.03) 0%, rgba(15, 23, 42, 0.01) 100%), #f8fafc'
  },
  {
    id: 'aurora_borealis',
    name: '🟢 Northern Aura',
    description: 'Scenic dark neon green and emerald aurora waves.',
    style: 'radial-gradient(circle at 10% 80%, rgba(16, 185, 129, 0.2) 0%, transparent 50%), radial-gradient(circle at 90% 20%, rgba(20, 184, 166, 0.18) 0%, transparent 60%), radial-gradient(circle at 50% 50%, rgba(16, 185, 129, 0.05) 0%, transparent 70%), linear-gradient(180deg, #022c22 0%, #042f1a 100%)'
  }
];

// Helper to generate a completely random, stunning, unique CSS background procedurally!
export const generateRandomBackground = (): { style: string; name: string } => {
  const styles = [
    'mesh', 
    'dot_grid', 
    'line_grid', 
    'aurora_light', 
    'striped_minimal',
    'modern_brutalist',
    'halo_ring',
    'silk_splines',
    'silk_sparkles'
  ];
  
  const chosenStyle = styles[Math.floor(Math.random() * styles.length)];
  
  // Choose random palette theme
  const keys = Object.keys(PALETTES);
  const randomPaletteKey = keys[Math.floor(Math.random() * keys.length)];
  const palette = PALETTES[randomPaletteKey];
  const isDark = randomPaletteKey === 'cosmic' || randomPaletteKey === 'cyberpunk' || randomPaletteKey === 'vaporwave' || randomPaletteKey === 'forest';

  const rColor = () => palette[Math.floor(Math.random() * palette.length)];

  // Helper for generating custom random degree (e.g. 45deg, 135deg)
  const rDeg = () => `${Math.floor(Math.random() * 360)}deg`;

  switch (chosenStyle) {
    case 'mesh': {
      const c1 = rColor();
      const c2 = rColor();
      const c3 = rColor();
      const c4 = rColor();
      const bg = isDark ? '#09090b' : '#fafafb';
      
      const x1 = Math.floor(Math.random() * 80);
      const y1 = Math.floor(Math.random() * 80);
      const x2 = 50 + Math.floor(Math.random() * 50);
      const y2 = Math.floor(Math.random() * 40);
      const x3 = Math.floor(Math.random() * 60);
      const y3 = 50 + Math.floor(Math.random() * 40);
      const x4 = 50 + Math.floor(Math.random() * 50);
      const y4 = 50 + Math.floor(Math.random() * 50);

      const style = `radial-gradient(at ${x1}% ${y1}%, ${c1} 0px, transparent 50%), radial-gradient(at ${x2}% ${y2}%, ${c2} 0px, transparent 45%), radial-gradient(at ${x3}% ${y3}%, ${c3} 0px, transparent 60%), radial-gradient(at ${x4}% ${y4}%, ${c4} 0px, transparent 40%), linear-gradient(${rDeg()}, ${bg} 0%, ${isDark ? '#18181b' : '#f0f0f4'} 100%)`;
      return {
        style,
        name: `🔮 Random ${randomPaletteKey.charAt(0).toUpperCase() + randomPaletteKey.slice(1)} Mesh`
      };
    }

    case 'dot_grid': {
      const gColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
      const accentGlow = rColor();
      const baseBg = isDark ? '#09090b' : '#fdfffb';
      const gap = [16, 20, 24, 32][Math.floor(Math.random() * 4)];
      
      const style = `radial-gradient(circle at ${10 + Math.floor(Math.random() * 80)}% ${10 + Math.floor(Math.random() * 80)}%, ${accentGlow}1d 0%, transparent 60%), radial-gradient(circle, ${gColor} 1px, transparent 1px) 0 0 / ${gap}px ${gap}px, ${baseBg}`;
      return {
        style,
        name: `📐 Procedural Dot ${gap}px`
      };
    }

    case 'line_grid': {
      const gColor = isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.03)';
      const accentGlow = rColor();
      const baseBg = isDark ? '#0b0b0f' : '#fcfcfd';
      const size = [30, 40, 50, 64][Math.floor(Math.random() * 4)];

      const style = `linear-gradient(${gColor} 1px, transparent 1px) 0 0 / ${size}px ${size}px, linear-gradient(90deg, ${gColor} 1px, transparent 1px) 0 0 / ${size}px ${size}px, radial-gradient(circle at 50% 50%, ${accentGlow}15 0%, transparent 70%), ${baseBg}`;
      return {
        style,
        name: `🕸️ Cyber Matrix Grid ${size}px`
      };
    }

    case 'aurora_light': {
      const glow1 = rColor();
      const glow2 = rColor();
      const baseBg = isDark ? '#030712' : '#fafaf7';
      const angle = rDeg();
      
      // Linear organic blends mimicking beautiful sky light
      const style = `linear-gradient(${angle}, ${glow1}22, transparent), linear-gradient(${rDeg()}, ${glow2}15, transparent), ${baseBg}`;
      return {
        style,
        name: `🌠 Aurora glow (${randomPaletteKey})`
      };
    }

    case 'striped_minimal': {
      const stripeColor = isDark ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0.01)';
      const baseBg = isDark ? '#111216' : '#ffffff';
      const highlight = rColor();
      const deg = rDeg();
      
      const style = `repeating-linear-gradient(${deg}, ${stripeColor}, ${stripeColor} 2px, transparent 2px, transparent 8px), radial-gradient(circle at top right, ${highlight}10 0%, transparent 60%), ${baseBg}`;
      return {
        style,
        name: `🦓 Minimalist Diagonal Stripe`
      };
    }

    case 'modern_brutalist': {
      // Split layout using gradient hard stops
      const c1 = isDark ? '#0c0a09' : '#fafaf9';
      const highlight = rColor();
      const borderCol = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';

      const style = `linear-gradient(90deg, ${c1} 65%, ${highlight}22 65%), linear-gradient(rgba(255,255,255,0) 0px, ${borderCol} 1px) 0 0 / 100% 12.5%, ${c1}`;
      return {
        style,
        name: `🧇 Brutalist Layout Grid`
      };
    }

    case 'halo_ring': {
      const centerAccent = rColor();
      const secondaryAccent = rColor();
      const baseBg = isDark ? '#050508' : '#fcfcff';

      const style = `radial-gradient(circle at 50% 50%, transparent 30%, ${centerAccent}0d 31%, transparent 70%), radial-gradient(circle at 50% 50%, transparent 50%, ${secondaryAccent}08 51%, transparent 80%), radial-gradient(circle at 50% 50%, ${centerAccent}15 0%, transparent 50%), ${baseBg}`;
      return {
        style,
        name: `🪐 Halo Energy Rings`
      };
    }

    case 'silk_splines': {
      const c1 = rColor();
      const c2 = rColor();
      const c3 = rColor();
      
      const bg = isDark ? '#06060c' : '#f5f5f9';
      
      const h1 = 300 + Math.floor(Math.random() * 150);
      const h2 = 400 + Math.floor(Math.random() * 200);
      const h3 = 200 + Math.floor(Math.random() * 150);
      const h4 = 500 + Math.floor(Math.random() * 150);

      const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1440 900' width='100%' height='100%' preserveAspectRatio='none'>
        <rect width='1440' height='900' fill='${bg.replace('#', '%23')}'/>
        <defs>
          <linearGradient id='randg1' x1='0' y1='0' x2='1' y2='1'>
            <stop offset='0%25' stop-color='${c1.replace('#', '%23')}' stop-opacity='0.4'/>
            <stop offset='50%25' stop-color='${c2.replace('#', '%23')}' stop-opacity='0.15'/>
            <stop offset='100%25' stop-color='${c3.replace('#', '%23')}' stop-opacity='0.05'/>
          </linearGradient>
          <linearGradient id='randg2' x1='1' y1='0' x2='0' y2='1'>
            <stop offset='0%25' stop-color='${c3.replace('#', '%23')}' stop-opacity='0.6'/>
            <stop offset='50%25' stop-color='${c1.replace('#', '%23')}' stop-opacity='0.25'/>
            <stop offset='100%25' stop-color='${c2.replace('#', '%23')}' stop-opacity='0'/>
          </linearGradient>
        </defs>
        <!-- Ambient lighting -->
        <circle cx='${150 + Math.floor(Math.random() * 300)}' cy='${300 + Math.floor(Math.random() * 200)}' r='350' fill='${c1.replace('#', '%23')}' opacity='0.12' />
        <circle cx='${900 + Math.floor(Math.random() * 400)}' cy='${400 + Math.floor(Math.random() * 300)}' r='400' fill='${c3.replace('#', '%23')}' opacity='0.09' />

        <!-- Spline Ribbons -->
        <path d='M0 ${h1} C 350 ${h1 - 150}, 1050 ${h2 + 150}, 1440 ${h1 + 50} Q 1050 850, 0 850 Z' fill='url(%23randg1)'/>
        <path d='M0 ${h1 + 40} C 350 ${h1 - 110}, 1050 ${h2 + 190}, 1440 ${h1 + 90}' fill='none' stroke='url(%23randg2)' stroke-width='6' opacity='0.75'/>
        <path d='M0 ${h3} C 400 ${h3 - 180}, 1000 ${h4 + 180}, 1440 ${h3 - 50}' fill='none' stroke='${c3.replace('#', '%23')}' stroke-width='1.5' opacity='0.6' />
        <path d='M0 ${h4} C 300 ${h4 + 120}, 1100 ${h3 - 120}, 1440 ${h4}' fill='none' stroke='${c2.replace('#', '%23')}' stroke-width='2' opacity='0.5' />
        <path d='M0 250 C 450 550, 990 150, 1440 650' fill='none' stroke='${c1.replace('#', '%23')}' stroke-width='2.5' stroke-dasharray='10,8' opacity='0.35' />
      </svg>`;
      
      const style = `url("data:image/svg+xml;utf8,${svg.replace(/\r?\n|\r/g, ' ')}")`;
      return {
        style,
        name: `〰️ Silk ${randomPaletteKey.charAt(0).toUpperCase() + randomPaletteKey.slice(1)} Splines`
      };
    }

    case 'silk_sparkles': {
      const c1 = rColor();
      const c2 = rColor();
      const c3 = rColor();
      const bg = isDark ? '#050512' : '#fcfcff';

      const h1 = 250 + Math.floor(Math.random() * 200);
      const h2 = 350 + Math.floor(Math.random() * 250);

      // Procedural sparkles nested at random spots
      const s1X = 100 + Math.floor(Math.random() * 200);
      const s1Y = 100 + Math.floor(Math.random() * 200);
      const s2X = 500 + Math.floor(Math.random() * 300);
      const s2Y = 200 + Math.floor(Math.random() * 400);
      const s3X = 1000 + Math.floor(Math.random() * 300);
      const s3Y = 150 + Math.floor(Math.random() * 200);
      const s4X = 1200 + Math.floor(Math.random() * 190);
      const s4Y = 400 + Math.floor(Math.random() * 400);

      const sparklePath = "d='M0 -12 Q0 0 12 0 Q0 0 0 12 Q0 0 -12 0 Q0 0 0 -12 Z'";
      const sparkleGoldPath = "d='M0 -8 Q0 0 8 0 Q0 0 0 8 Q0 0 -8 0 Q0 0 0 -8 Z'";

      const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1440 900' width='100%' height='100%' preserveAspectRatio='none'>
        <rect width='1440' height='900' fill='${bg.replace('#', '%23')}'/>
        <defs>
          <linearGradient id='aurag_rand1' x1='0' y1='0' x2='1' y2='1'>
            <stop offset='0%25' stop-color='${c1.replace('#', '%23')}' stop-opacity='0.4'/>
            <stop offset='50%25' stop-color='${c2.replace('#', '%23')}' stop-opacity='0.2'/>
            <stop offset='100%25' stop-color='${c3.replace('#', '%23')}' stop-opacity='0.05'/>
          </linearGradient>
          <linearGradient id='aurag_rand2' x1='1' y1='0' x2='0' y2='1'>
            <stop offset='0%25' stop-color='${c3.replace('#', '%23')}' stop-opacity='0.55'/>
            <stop offset='60%25' stop-color='${c1.replace('#', '%23')}' stop-opacity='0.15'/>
            <stop offset='100%25' stop-color='${c2.replace('#', '%23')}' stop-opacity='0'/>
          </linearGradient>
        </defs>
        
        <!-- Organic light flowing waves -->
        <path d='M-100 ${h1} C 350 ${h1 - 250}, 1000 ${h2 + 250}, 1540 ${h1 - 50} L 1540 900 L -100 900 Z' fill='url(%23aurag_rand1)'/>
        <path d='M-100 ${h1 + 30} C 410 ${h1 - 200}, 980 ${h2 + 230}, 1540 ${h1 - 10}' fill='none' stroke='url(%23aurag_rand2)' stroke-width='4' opacity='0.75'/>
        <path d='M-100 ${h1 - 30} C 430 ${h1 - 260}, 1020 ${h2 + 180}, 1540 ${h1 - 80}' fill='none' stroke='${c3.replace('#', '%23')}' stroke-width='1.5' opacity='0.5'/><use href='%23sparkle' x='200' y='280' opacity='0.8' />
        <path d='M-100 ${h1 + 80} C 250 ${h1 + 250}, 1190 ${h1 - 150}, 1540 ${h1 + 250}' fill='none' stroke='${isDark ? '%23ffffff' : '%234f46e5'}' stroke-width='1' stroke-dasharray='10,6' opacity='0.25'/>

        <!-- Beautiful Twinkling Sparkles -->
        <g transform='translate(${s1X}, ${s1Y}) scale(0.9)' opacity='0.8'><path ${sparklePath} fill='${isDark ? '%23ffffff' : c1.replace('#', '%23')}'/></g>
        <g transform='translate(${s2X}, ${s2Y}) scale(1.3)' opacity='0.95'><path ${sparklePath} fill='${isDark ? '%23ffffff' : c2.replace('#', '%23')}'/></g>
        <g transform='translate(${s2X - 40}, ${s2Y + 60}) scale(0.6)' opacity='0.6'><path ${sparkleGoldPath} fill='%23fef08a'/></g>
        <g transform='translate(${s3X}, ${s3Y}) scale(1)' opacity='0.85'><path ${sparklePath} fill='${isDark ? '%23ffffff' : c3.replace('#', '%23')}'/></g>
        <g transform='translate(${s3X + 70}, ${s3Y - 30}) scale(0.7)' opacity='0.55'><path ${sparkleGoldPath} fill='%23fef08a'/></g>
        <g transform='translate(${s4X}, ${s4Y}) scale(1.15)' opacity='0.9'><path ${sparklePath} fill='${isDark ? '%23ffffff' : c1.replace('#', '%23')}'/></g>
        <g transform='translate(${s1X + 400}, ${s1Y + 300}) scale(0.7)' opacity='0.4'><path ${sparkleGoldPath} fill='%23fef08a'/></g>
        <g transform='translate(${100 + Math.floor(Math.random() * 1200)}, ${300 + Math.floor(Math.random() * 500)}) scale(0.5)' opacity='0.5'><path ${sparklePath} fill='%23ffffff'/></g>
      </svg>`;

      const style = `url("data:image/svg+xml;utf8,${svg.replace(/\r?\n|\r/g, ' ')}")`;
      return {
        style,
        name: `✨ Silk ${randomPaletteKey.charAt(0).toUpperCase() + randomPaletteKey.slice(1)} Sparkles`
      };
    }

    default:
      return {
        style: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
        name: 'Default Gradient'
      };
  }
};
