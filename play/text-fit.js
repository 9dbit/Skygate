/* Fit complete labels/amounts, including wallet captions, without truncation.
 * Read geometry in one batch; write only when the scale actually changes. */
(() => {
  const queued = new Set();
  let frame = false;
  function fit(root) {
    const changes = Array.from(root.querySelectorAll('.text-layer')).map(box => {
      const content = box.querySelector('.text-content');
      if (!content || !box.clientWidth || !box.clientHeight) return null;
      const scale = Math.min(1, box.clientWidth * .98 / Math.max(1, content.offsetWidth),
        box.clientHeight * .98 / Math.max(1, content.offsetHeight));
      return {content, value: `scale(${Math.max(.01, scale).toFixed(4)})`};
    });
    for (const change of changes) if (change && change.content.style.transform !== change.value)
      change.content.style.transform = change.value;
  }
  function request(root) {
    queued.add(root);
    if (frame) return;
    frame = true;
    requestAnimationFrame(() => {
      frame = false;
      for (const root of queued) fit(root);
      queued.clear();
    });
  }
  window.SkygateTextFit = {fit, request};
})();
