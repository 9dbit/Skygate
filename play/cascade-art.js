/* Original, reusable vector textures. Geometry is built once, not per frame.
 * No game RNG, canvas loop, animated blur, or downloaded effects are involved. */
(() => {
  const svg = body => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">${body}</svg>`);
  const rounded = n => n.toFixed(2);
  const glowPath = (d, width = 1.3) =>
    `<path d="${d}" fill="none" stroke="#ec740b" stroke-width="8" opacity=".18" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="#ffbd32" stroke-width="3.3" opacity=".9" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="#fff6be" stroke-width="${width}" stroke-linejoin="round"/>`;
  let edge = '';
  for (let side = 0; side < 4; side++) for (let step = 0; step < 24; step++) {
    const along = 5 + step * 118 / 24;
    const jitter = Math.sin(step * 4.3 + side * 2.1) * 1.7;
    const [x, y] = [[along,5+jitter],[123-jitter,along],[128-along,123-jitter],[5+jitter,128-along]][side];
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
  let spiral = '';
  for (let i = 0; i < 94; i++) {
    const t = i / 93, angle = t * Math.PI * 4.4, radius = 3 + t * 44;
    const jitter = Math.sin(i * 3.7) * 1.4;
    spiral += `${i?'L':'M'}${rounded(64+Math.cos(angle)*(radius+jitter))} ${rounded(64+Math.sin(angle)*(radius+jitter))} `;
  }
  window.SkygateCascadeArt = {edge: svg(glowPath(edge)), burst: svg(burst), spiral: svg(glowPath(spiral, 1.1))};
})();
