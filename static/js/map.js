/**
 * PathPulse AI — Dashboard Map Script
 * Initializes the main map and loads pothole markers
 */

// ── Map Initialization ──────────────────────────────────────────────
const map = L.map('main-map', {
  zoomControl: true,
  attributionControl: true
}).setView([12.971599, 77.594566], 11);  // Default: Bengaluru, India

// Map Layers
const cartoLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; <a href="https://carto.com/"></a> &copy; <a href="https://www.openstreetmap.org/copyright"></a>',
  maxZoom: 20
});

const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Tiles &copy; Esri',
  maxZoom: 19
});

const terrainLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
  maxZoom: 17
});

cartoLayer.addTo(map);

const baseMaps = {
  "Standard": cartoLayer,
  "Satellite": satelliteLayer,
  "Terrain": terrainLayer
};

L.control.layers(baseMaps, null, { position: 'bottomright' }).addTo(map);

// ── Severity Colors ─────────────────────────────────────────────────
const SEVERITY_COLORS = {
  low:    '#09681fff',
  medium: '#f59e0b',
  high:   '#ef4444'
};

const SEVERITY_RADIUS = {
  low: 8,
  medium: 10,
  high: 13
};

// ── User Location Marker ────────────────────────────────────────────
let userLocationMarker = null;
let userLocationCircle = null;

let locationWatchId = null;

function showUserLocation(lat, lng, accuracy, centerMap = true) {
  if (userLocationMarker) {
    userLocationMarker.setLatLng([lat, lng]);
    userLocationCircle.setLatLng([lat, lng]);
    if (accuracy) userLocationCircle.setRadius(accuracy);
  } else {
    userLocationMarker = L.circleMarker([lat, lng], {
      radius: 8,
      fillColor: '#06d6a0',
      fillOpacity: 1,
      color: '#ffffff',
      weight: 3
    }).addTo(map).bindPopup('📍 You are here');

    userLocationCircle = L.circle([lat, lng], {
      radius: accuracy || 100,
      fillColor: '#06d6a0',
      fillOpacity: 0.08,
      color: '#06d6a0',
      weight: 1,
      opacity: 0.3
    }).addTo(map);
  }

  if (centerMap) {
    map.setView([lat, lng], 15);
  }

  // Update live routing if active
  if (window.routingControl) {
    window.routingControl.spliceWaypoints(0, 1, L.latLng(lat, lng));
  }
}

// ── Locate User ─────────────────────────────────────────────────────
function locateUser() {
  const btn = document.getElementById('btn-locate');
  if (btn) {
    btn.innerHTML = '⏳ Locating...';
    btn.disabled = true;
  }

  if (!navigator.geolocation) {
    alert('Geolocation is not supported by your browser.');
    if (btn) { btn.innerHTML = '📍 My Location'; btn.disabled = false; }
    return;
  }

  if (locationWatchId !== null) {
    navigator.geolocation.clearWatch(locationWatchId);
  }

  let firstLoc = true;
  let locationResolved = false;
  
  setTimeout(() => {
    if (!locationResolved) {
      console.log('Geolocation request timed out.');
      if (btn) { btn.innerHTML = '📍 Location Timeout'; btn.disabled = false; }
    }
  }, 5000);
  
  // Use getCurrentPosition to ensure we get an immediate fix
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      locationResolved = true;
      showUserLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, true);
      if (btn) { btn.innerHTML = '📍 My Location'; btn.disabled = false; }
      
      // Once we have initial location, start watching for changes
      locationWatchId = navigator.geolocation.watchPosition(
        (wPos) => {
          showUserLocation(wPos.coords.latitude, wPos.coords.longitude, wPos.coords.accuracy, false);
        },
        (err) => console.warn('Geolocation watch error:', err.message),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
      );
    },
    (err) => {
      locationResolved = true;
      console.warn('Geolocation error:', err.message);
      alert('Unable to retrieve location: ' + err.message);
      if (btn) { btn.innerHTML = '📍 Location Error'; btn.disabled = false; }
    },
    { enableHighAccuracy: false, timeout: 5000, maximumAge: 0 }
  );
}

// ── Pothole Markers Layer ───────────────────────────────────────────
let potholeLayer = L.layerGroup().addTo(map);

function createPotholeMarker(pothole) {
  const color = SEVERITY_COLORS[pothole.severity] || SEVERITY_COLORS.medium;
  const radius = SEVERITY_RADIUS[pothole.severity] || 10;

  const marker = L.circleMarker([pothole.latitude, pothole.longitude], {
    radius: radius,
    fillColor: color,
    fillOpacity: 0.8,
    color: '#ffffff',
    weight: 2,
    opacity: 0.9
  });

  const date = pothole.created_at ? new Date(pothole.created_at).toLocaleDateString() : 'Unknown';

  marker.bindPopup(`
    <div class="popup-title">🕳️ Pothole Detected</div>
    <span class="popup-severity ${pothole.severity}">${pothole.severity.toUpperCase()}</span>
    <div class="popup-meta">
      <div>📍 ${pothole.latitude.toFixed(5)}, ${pothole.longitude.toFixed(5)}</div>
      <div>📊 Reports: ${pothole.report_count} | Confidence: ${(pothole.confidence * 100).toFixed(0)}%</div>
      <div>📅 ${date}</div>
    </div>
  `);

  return marker;
}

// ── Load Potholes ───────────────────────────────────────────────────
async function loadPotholes() {
  try {
    const res = await fetch('/api/potholes');
    const data = await res.json();

    potholeLayer.clearLayers();

    if (data.potholes && data.potholes.length > 0) {
      data.potholes.forEach(p => {
        const marker = createPotholeMarker(p);
        potholeLayer.addLayer(marker);
      });

      // Fit map bounds to markers if no user location
      if (!userLocationMarker) {
        const group = L.featureGroup(potholeLayer.getLayers());
        if (group.getLayers().length > 0) {
          map.fitBounds(group.getBounds().pad(0.2));
        }
      }
    }
  } catch (err) {
    console.error('Failed to load potholes:', err);
  }
}

// ── Refresh ─────────────────────────────────────────────────────────
async function refreshMap() {
  const btn = document.getElementById('btn-refresh-map');
  const originalText = btn ? btn.innerHTML : '🔄 Refresh Map';
  const mapEl = document.getElementById('main-map');
  
  if (btn) {
    btn.innerHTML = '⏳ Refreshing...';
    btn.disabled = true;
  }
  
  if (mapEl) {
    mapEl.style.transition = 'opacity 0.2s ease-in-out';
    mapEl.style.opacity = '0.4';
  }
  
  await loadPotholes();
  
  // Guarantee the blink is visible even if the API responds instantly
  await new Promise(r => setTimeout(r, 250));
  
  if (mapEl) {
    mapEl.style.opacity = '1';
  }
  
  if (btn) {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

// ── Routing & Search ────────────────────────────────────────────────
let currentRouteLayer = null;
let destinationMarker = null;

const searchInput = document.getElementById('map-search');
const suggestionsBox = document.getElementById('search-suggestions');
let searchTimeout = null;

if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    
    if (query.length < 3) {
      suggestionsBox.style.display = 'none';
      return;
    }
    
    searchTimeout = setTimeout(() => {
      let url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=50&lang=en`;
      
      // Prioritize search results near the current map center
      if (map) {
        const center = map.getCenter();
        url += `&lat=${center.lat}&lon=${center.lng}`;
      }

      fetch(url)
        .then(res => res.json())
        .then(data => {
          suggestionsBox.innerHTML = '';
          if (!data.features || data.features.length === 0) {
            suggestionsBox.innerHTML = '<div class="suggestion-item">No results found</div>';
          } else {
            data.features.forEach(feature => {
              const place = feature.properties;
              const coords = feature.geometry.coordinates; // [lon, lat]
              const lat = coords[1];
              const lon = coords[0];
              
              const div = document.createElement('div');
              div.className = 'suggestion-item';
              
              // Clean up the display name for better readability
              const parts = [];
              if (place.name) parts.push(place.name);
              if (place.street) parts.push(place.street);
              if (place.district) parts.push(place.district);
              if (place.city || place.town) parts.push(place.city || place.town);
              if (place.state) parts.push(place.state);
              
              const title = place.name || place.street || place.city || place.town || "Unknown Location";
              const subtitle = parts.filter(p => p !== title).slice(0, 3).join(', ') || place.country || "";
              
              div.innerHTML = `<strong>${title}</strong><br><span style="font-size:0.75rem; color:var(--text-muted);">${subtitle}</span>`;
              div.addEventListener('click', () => {
                selectDestination(lat, lon, title);
                suggestionsBox.style.display = 'none';
                searchInput.value = title;
              });
              suggestionsBox.appendChild(div);
            });
          }
          suggestionsBox.style.display = 'block';
        })
        .catch(err => console.error('Search error:', err));
    }, 400);
  });
  
  // Hide suggestions when clicking outside
  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
      suggestionsBox.style.display = 'none';
    }
  });
}

window.selectDestination = function(lat, lon, displayName) {
  map.setView([lat, lon], 14);
  
  if (destinationMarker) {
    map.removeLayer(destinationMarker);
  }
  
  destinationMarker = L.marker([lat, lon]).addTo(map);
  destinationMarker.bindPopup(`
    <div class="popup-title">🎯 Destination</div>
    <div class="popup-meta" style="margin-bottom:8px; line-height:1.4;">${displayName}</div>
    <button class="btn btn-primary btn-sm" onclick="getDirections(${lat}, ${lon})" style="width:100%; padding:8px; margin-top:8px;">
      🗺️ Get Directions
    </button>
  `).openPopup();
}

window.routingControl = null;

window.getDirections = function(destLat, destLon) {
  if (!userLocationMarker) {
    alert("Your current location is unknown. Please wait to be located or check your browser permissions.");
    return;
  }
  
  const userLat = userLocationMarker.getLatLng().lat;
  const userLon = userLocationMarker.getLatLng().lng;
  
  if (destinationMarker) destinationMarker.closePopup();
  
  if (window.routingControl) {
    map.removeControl(window.routingControl);
  }
  if (currentRouteLayer) {
    map.removeLayer(currentRouteLayer);
    currentRouteLayer = null;
  }
  
  window.routingControl = L.Routing.control({
    waypoints: [
      L.latLng(userLat, userLon),
      L.latLng(destLat, destLon)
    ],
    routeWhileDragging: false,
    showAlternatives: false,
    fitSelectedRoutes: false,
    lineOptions: {
      styles: [{ color: '#2563eb', weight: 6, opacity: 0.8 }]
    },
    createMarker: function() { return null; } // Use existing markers
  }).addTo(map);

  window.routingControl.on('routesfound', function(e) {
    const route = e.routes[0];
    const distanceKm = (route.summary.totalDistance / 1000).toFixed(1);
    
    // Manually fit the map to the route with padding and a max zoom limit
    const bounds = L.latLngBounds(route.coordinates);
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    
    const routeInfo = document.getElementById('route-info');
    const routeDistance = document.getElementById('route-distance');
    
    if (routeInfo && routeDistance) {
      routeDistance.textContent = distanceKm;
      routeInfo.style.display = 'flex';
    }
  });
}

window.clearRoute = function() {
  if (window.routingControl) {
    map.removeControl(window.routingControl);
    window.routingControl = null;
  }
  if (currentRouteLayer) {
    map.removeLayer(currentRouteLayer);
    currentRouteLayer = null;
  }
  if (destinationMarker) {
    map.removeLayer(destinationMarker);
    destinationMarker = null;
  }
  document.getElementById('route-info').style.display = 'none';
  document.getElementById('map-search').value = '';
}

// ── Initial Load ────────────────────────────────────────────────────
setupSearch();
loadPotholes();

// Auto-locate on load
locateUser();

// Auto-refresh every 30 seconds
setInterval(refreshMap, 30000);
