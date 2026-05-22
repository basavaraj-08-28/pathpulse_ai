/**
 * PathPulse AI — Pothole Detection Engine
 * Uses phone accelerometer + GPS to detect and report potholes in real-time
 */

// ── State ───────────────────────────────────────────────────────────
let isDetecting = false;
let watchId = null;
let detectionCount = 0;
let lastReportTime = 0;
const REPORT_COOLDOWN = 2000; // ms between reports (avoid duplicates)
const POTHOLE_THRESHOLD = 18; // m/s² — spike threshold for detection
const GRAVITY = 9.81;

// Accelerometer history for smoothing
const accelHistory = [];
const HISTORY_SIZE = 5;

// ── Map Setup ───────────────────────────────────────────────────────
const map = L.map('detect-map', {
  zoomControl: true
}).setView([13.0827, 80.2707], 15);

L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; CARTO &copy; OSM',
  maxZoom: 19
}).addTo(map);

let userMarker = null;
let routeLine = null;
const routeCoords = [];
const potholeLayer = L.layerGroup().addTo(map);

// Load existing potholes
loadExistingPotholes();

// ── Severity Colors ─────────────────────────────────────────────────
const SEVERITY_COLORS = {
  low:    '#3b82f6',
  medium: '#f59e0b',
  high:   '#ef4444'
};

// ── Start Detection ─────────────────────────────────────────────────
function startDetection() {
  // Check for required APIs
  if (!navigator.geolocation) {
    alert('Geolocation is not supported by your browser.');
    return;
  }

  isDetecting = true;
  updateStatus('detecting', '🔍 Scanning road surface...');
  document.getElementById('btn-start').disabled = true;
  document.getElementById('btn-stop').disabled = false;

  // Start GPS tracking
  watchId = navigator.geolocation.watchPosition(
    onPositionUpdate,
    onPositionError,
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
  );

  // Start accelerometer
  startAccelerometer();
}

// ── Stop Detection ──────────────────────────────────────────────────
function stopDetection() {
  isDetecting = false;
  updateStatus('idle', '⏹ Detection stopped');
  document.getElementById('btn-start').disabled = false;
  document.getElementById('btn-stop').disabled = true;

  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  stopAccelerometer();
}

// ── Accelerometer ───────────────────────────────────────────────────
let accelHandler = null;

function startAccelerometer() {
  if (window.DeviceMotionEvent) {
    // Check if permission is needed (iOS 13+)
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      DeviceMotionEvent.requestPermission()
        .then(state => {
          if (state === 'granted') {
            attachAccelListener();
          } else {
            alert('Accelerometer permission denied. Real-time detection cannot proceed.');
            stopDetection();
          }
        })
        .catch(() => {
          alert('Failed to access accelerometer.');
          stopDetection();
        });
    } else {
      attachAccelListener();
      // If no real data comes in 2 seconds, notify user
      setTimeout(() => {
        if (isDetecting && accelHistory.length === 0) {
          alert('No accelerometer data detected. Ensure your device has sensors.');
          stopDetection();
        }
      }, 2000);
    }
  } else {
    alert('DeviceMotion not supported. Detection requires a physical device with an accelerometer.');
    stopDetection();
  }
}

function attachAccelListener() {
  accelHandler = (event) => {
    if (!isDetecting) return;
    const acc = event.accelerationIncludingGravity;
    if (acc && acc.x !== null) {
      processAccelData(acc.x, acc.y, acc.z);
    }
  };
  window.addEventListener('devicemotion', accelHandler);
}

function stopAccelerometer() {
  if (accelHandler) {
    window.removeEventListener('devicemotion', accelHandler);
    accelHandler = null;
  }
  if (simInterval) {
    clearInterval(simInterval);
    simInterval = null;
  }
}

// ── Simulated Accelerometer Removed ───────────────────────────────────

// ── Process Accelerometer Data ──────────────────────────────────────
let currentPosition = null;

function processAccelData(x, y, z) {
  // Update UI
  document.getElementById('accel-x').textContent = x.toFixed(1);
  document.getElementById('accel-y').textContent = y.toFixed(1);
  document.getElementById('accel-z').textContent = z.toFixed(1);

  // Calculate magnitude (removing gravity baseline)
  const magnitude = Math.sqrt(x * x + y * y + z * z);
  const deviation = Math.abs(magnitude - GRAVITY);

  document.getElementById('magnitude-value').textContent = deviation.toFixed(1) + ' m/s²';

  // Update magnitude bar (max at 40 m/s²)
  const barPercent = Math.min(100, (deviation / 40) * 100);
  const fill = document.getElementById('magnitude-fill');
  fill.style.width = barPercent + '%';

  // Color the bar based on intensity
  if (deviation > POTHOLE_THRESHOLD) {
    fill.style.background = 'linear-gradient(90deg, #f59e0b, #ef4444)';
  } else if (deviation > POTHOLE_THRESHOLD * 0.6) {
    fill.style.background = 'linear-gradient(90deg, #06d6a0, #f59e0b)';
  } else {
    fill.style.background = 'var(--gradient-1)';
  }

  // Smoothing: keep history
  accelHistory.push(deviation);
  if (accelHistory.length > HISTORY_SIZE) accelHistory.shift();

  // Detect pothole: spike above threshold
  const now = Date.now();
  if (deviation > POTHOLE_THRESHOLD && (now - lastReportTime) > REPORT_COOLDOWN) {
    lastReportTime = now;
    onPotholeDetected(deviation);
  }
}

// ── GPS Position Update ─────────────────────────────────────────────
function onPositionUpdate(position) {
  const lat = position.coords.latitude;
  const lng = position.coords.longitude;
  currentPosition = { lat, lng };

  // Update user marker
  if (!userMarker) {
    userMarker = L.circleMarker([lat, lng], {
      radius: 8,
      fillColor: '#06d6a0',
      fillOpacity: 1,
      color: '#ffffff',
      weight: 3
    }).addTo(map);

    // Add pulsing effect
    const pulseMarker = L.circleMarker([lat, lng], {
      radius: 20,
      fillColor: '#336ac8ff',
      fillOpacity: 0.2,
      color: '#06d6a0',
      weight: 1,
      opacity: 0.5
    }).addTo(map);

    setInterval(() => {
      if (currentPosition) {
        pulseMarker.setLatLng([currentPosition.lat, currentPosition.lng]);
      }
    }, 1000);
  } else {
    userMarker.setLatLng([lat, lng]);
  }

  // Track route
  routeCoords.push([lat, lng]);
  if (routeLine) {
    routeLine.setLatLngs(routeCoords);
  } else {
    routeLine = L.polyline(routeCoords, {
      color: '#06d6a0',
      weight: 3,
      opacity: 0.6,
      dashArray: '8, 8'
    }).addTo(map);
  }

  map.panTo([lat, lng]);
}

function onPositionError(err) {
  console.warn('GPS Error:', err.message);
  if (isDetecting) {
    updateStatus('alert', '⚠️ GPS Error: ' + err.message);
  }
}

// ── Pothole Detected! ───────────────────────────────────────────────
async function onPotholeDetected(accelPeak) {
  detectionCount++;

  // Determine position
  if (!currentPosition) {
    console.warn("Pothole detected but GPS location is unknown. Cannot report.");
    return;
  }
  let lat = currentPosition.lat;
  let lng = currentPosition.lng;

  // Determine severity
  let severity;
  if (accelPeak >= 25) severity = 'high';
  else if (accelPeak >= 15) severity = 'medium';
  else severity = 'low';

  // Flash status
  updateStatus('alert', `🚨 POTHOLE DETECTED — ${severity.toUpperCase()}`);
  setTimeout(() => {
    if (isDetecting) updateStatus('detecting', '🔍 Scanning road surface...');
  }, 2000);

  // Add marker to map
  const color = SEVERITY_COLORS[severity];
  const marker = L.circleMarker([lat, lng], {
    radius: severity === 'high' ? 13 : severity === 'medium' ? 10 : 8,
    fillColor: color,
    fillOpacity: 0.85,
    color: '#fff',
    weight: 2
  }).addTo(potholeLayer);

  marker.bindPopup(`
    <div class="popup-title">🕳️ Pothole Detected</div>
    <span class="popup-severity ${severity}">${severity.toUpperCase()}</span>
    <div class="popup-meta">
      <div>📊 Acceleration: ${accelPeak.toFixed(1)} m/s²</div>
      <div>📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}</div>
    </div>
  `);

  // Add to log
  addLogEntry(severity, lat, lng, accelPeak);

  // Report to server
  try {
    await fetch('/api/potholes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latitude: lat,
        longitude: lng,
        accel_peak: accelPeak,
        confidence: Math.min(1.0, accelPeak / 40)
      })
    });
  } catch (err) {
    console.error('Failed to report pothole:', err);
  }
}

// ── UI Helpers ──────────────────────────────────────────────────────
function updateStatus(state, text) {
  const indicator = document.getElementById('status-indicator');
  const statusText = document.getElementById('status-text');
  indicator.className = 'status-indicator ' + state;
  statusText.textContent = text;
}

function addLogEntry(severity, lat, lng, accelPeak) {
  const log = document.getElementById('detection-log');
  const countEl = document.getElementById('log-count');

  // Remove placeholder if present
  if (detectionCount === 1) {
    log.innerHTML = '';
  }

  const time = new Date().toLocaleTimeString();

  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = `
    <span class="severity-dot ${severity}"></span>
    <span><strong>${severity.toUpperCase()}</strong> — ${accelPeak.toFixed(1)} m/s²</span>
    <span class="log-time">${time}</span>
  `;

  log.insertBefore(entry, log.firstChild);
  countEl.textContent = detectionCount + ' detection' + (detectionCount !== 1 ? 's' : '');
}

// ── Load Existing Potholes ──────────────────────────────────────────
async function loadExistingPotholes() {
  try {
    const res = await fetch('/api/potholes');
    const data = await res.json();
    if (data.potholes) {
      data.potholes.forEach(p => {
        const color = SEVERITY_COLORS[p.severity] || SEVERITY_COLORS.medium;
        L.circleMarker([p.latitude, p.longitude], {
          radius: p.severity === 'high' ? 13 : p.severity === 'medium' ? 10 : 8,
          fillColor: color,
          fillOpacity: 0.5,
          color: '#fff',
          weight: 1,
          opacity: 0.6
        }).addTo(potholeLayer).bindPopup(`
          <div class="popup-title">🕳️ Previously Reported</div>
          <span class="popup-severity ${p.severity}">${p.severity.toUpperCase()}</span>
          <div class="popup-meta">
            Reports: ${p.report_count} | Confidence: ${(p.confidence * 100).toFixed(0)}%
          </div>
        `);
      });
    }
  } catch (e) {
    console.error('Failed to load existing potholes:', e);
  }
}

// ── Center on user location ─────────────────────────────────────────
if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(
    onPositionUpdate,
    () => {},
    { enableHighAccuracy: true, timeout: 5000 }
  );
}
