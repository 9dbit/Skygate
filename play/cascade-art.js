/* Original, reusable vector textures. Geometry is built once, not per frame.
 * No game RNG, canvas loop, animated blur, or downloaded effects are involved. */
(() => {
  const svg = body => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" preserveAspectRatio="none">${body}</svg>`);
  const rounded = n => n.toFixed(2);
  const glowPath = (d, width = 1.3) =>
    `<path d="${d}" fill="none" stroke="#ec740b" stroke-width="9" opacity=".28" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="#ffbd32" stroke-width="4.5" opacity="1" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="#fff6be" stroke-width="${width}" stroke-linejoin="round"/>`;
  let edge = '';
  for (let side = 0; side < 4; side++) for (let step = 0; step < 24; step++) {
    const along = 1 + step * 126 / 24;
    const jitter = Math.sin(step * 4.3 + side * 2.1) * .65;
    const [x, y] = [[along,1+jitter],[127-jitter,along],[128-along,127-jitter],[1+jitter,128-along]][side];
    edge += `${edge ? 'L' : 'M'}${rounded(x)} ${rounded(y)} `;
  }
  edge += 'Z';
  let burst = '<defs><radialGradient id="flare"><stop stop-color="#fffbe1" stop-opacity=".98"/><stop offset=".22" stop-color="#ffdf65" stop-opacity=".65"/><stop offset="1" stop-color="#ff8a12" stop-opacity="0"/></radialGradient></defs><circle cx="64" cy="64" r="43" fill="url(#flare)"/>';
  for (let i = 0; i < 34; i++) {
    const angle = i * 2.39996, radius = 22 + (i * 17 % 36);
    const x = 64 + Math.cos(angle) * radius, y = 64 + Math.sin(angle) * radius;
    const length = i % 3 ? 2.5 : 9;
    burst += `<path d="M${rounded(x)} ${rounded(y)}l${rounded(Math.cos(angle)*length)} ${rounded(Math.sin(angle)*length)}" stroke="${i%3?'#ffcf55':'#fff3b2'}" stroke-width="${i%3?1.5:2}" stroke-linecap="round"/>`;
    burst += `<circle cx="${rounded(x)}" cy="${rounded(y)}" r="${i%4?1:2}" fill="#fff7c7"/>`;
  }
  // One predecoded vector sprite supplies many bright trails per winning cell.
  let firework='<defs><radialGradient id="core"><stop stop-color="#fff"/><stop offset=".16" stop-color="#fff5c4"/><stop offset=".42" stop-color="#ffba35" stop-opacity=".55"/><stop offset="1" stop-color="#ff7300" stop-opacity="0"/></radialGradient></defs><circle cx="64" cy="64" r="32" fill="url(#core)"/>';
  for(let i=0;i<32;i++){
    const a=i*Math.PI/16,inner=11+i%4*3,outer=37+i%5*5;
    const xy=r=>`${rounded(64+Math.cos(a)*r)} ${rounded(64+Math.sin(a)*r)}`;
    firework+=`<path d="M${xy(inner)}L${xy(outer)}" stroke="${i%4?'#ffc34a':'#9cdeff'}" stroke-width="2.2" opacity=".8"/><path d="M${xy(outer-12)}L${xy(outer)}" stroke="#fff9df" stroke-width="1.2"/><circle cx="${rounded(64+Math.cos(a)*outer)}" cy="${rounded(64+Math.sin(a)*outer)}" r="${i%3?1.2:2}" fill="#fff"/>`;
  }
  window.SkygateCascadeArt = {edge: svg(glowPath(edge, 2.6)), burst: svg(burst),firework:svg(firework)};
})();
