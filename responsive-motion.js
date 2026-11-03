(() => {
  const progress = document.getElementById('scroll-progress');
  if (!progress) return;
  let scheduled = false;
  const update = () => {
    scheduled = false;
    const root = document.documentElement;
    const distance = root.scrollHeight - window.innerHeight;
    const position = distance > 0 ? Math.min(1, Math.max(0, window.scrollY / distance)) : 0;
    progress.style.transform = `scaleX(${position})`;
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(update);
  };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(schedule).observe(document.body);
  update();
})();
