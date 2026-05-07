/**
 * PathPulse AI — Dashboard Stats Script
 */

async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    if (data.stats) {
      animateCounter('stat-total', data.stats.total_reported);
      animateCounter('stat-active', data.stats.active_potholes);
      animateCounter('stat-resolved', data.stats.resolved);
      animateCounter('stat-high', data.stats.high_severity);
    }
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

function animateCounter(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  let current = 0;
  const step = Math.max(1, Math.ceil(target / 30));
  const interval = setInterval(() => {
    current += step;
    if (current >= target) {
      current = target;
      clearInterval(interval);
    }
    el.textContent = current;
  }, 30);
}

// Initial Load
document.addEventListener('DOMContentLoaded', () => {
    loadStats();
    // Auto-refresh stats every 30 seconds
    setInterval(loadStats, 30000);
});
