const map = L.map('map').setView([50.7, -3.5], 10);

const roadTypeLabels = {
    'primary': 'Busy Road (Avoid!)',
    'trunk': 'Busy Road (Avoid!)',
    'secondary': 'Main Road',
    'tertiary': 'Country Lane',
    'unclassified': 'Country Lane',
    'residential': 'Street',
    'service': 'Street',
    'living_street': 'Street',
    'footway': 'Off-Road Path',
    'path': 'Off-Road Path',
    'bridleway': 'Off-Road Path',
    'track': 'Off-Road Path',
    'cycleway': 'Off-Road Path',
    'steps': 'Off-Road Path',
    'pedestrian': 'Off-Road Path',
    'unknown': 'Unknown'
};

const roadTypeColors = {
    'Busy Road (Avoid!)': '#ef4444',
    'Main Road': '#f97316',
    'Country Lane': '#eab308',
    'Street': '#a3e635',
    'Off-Road Path': '#22c55e',
    'Unknown': '#6b7280'
};

const COLOR_MAP = {
    'primary': '#ef4444',
    'trunk': '#ef4444',
    'secondary': '#ef4444',
    'tertiary': '#eab308',
    'unclassified': '#eab308',
    'residential': '#84cc16',
    'service': '#84cc16',
    'living_street': '#84cc16',
    'footway': '#10b981',
    'path': '#10b981',
    'bridleway': '#10b981',
    'track': '#10b981',
    'steps': '#10b981',
    'cycleway': '#10b981',
    'pedestrian': '#10b981'
};

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let startMarker = null;
let endMarker = null;
let routeLayer = null;
let clickState = 0;

const startInput = document.getElementById('start-input');
const endInput = document.getElementById('end-input');
const calculateBtn = document.getElementById('calculate-btn');
const statusArea = document.getElementById('status-area');
const breakdownContainer = document.getElementById('breakdown-container');

function renderBreakdown(breakdown, totalDistance) {
    breakdownContainer.innerHTML = '';
    
    if (!breakdown || Object.keys(breakdown).length === 0) return;
    
    const aggregated = {};
    for (const [osmType, distance] of Object.entries(breakdown)) {
        const label = roadTypeLabels[osmType] || 'Unknown';
        if (!aggregated[label]) {
            aggregated[label] = { distance: 0, type: osmType };
        }
        aggregated[label].distance += distance;
    }
    
    const sorted = Object.entries(aggregated).sort((a, b) => b[1].distance - a[1].distance);
    
    let html = '';
    for (const [label, data] of sorted) {
        const percent = (data.distance / totalDistance) * 100;
        const dist = data.distance;
        const type = data.type;
        
        html += `
            <div style="margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; font-size: 0.875rem; margin-bottom: 4px;">
                    <span>${label}</span>
                    <span style="color: #9ca3af;">${(dist/1000).toFixed(1)} km</span>
                </div>
                <div style="width: 100%; background-color: #374151; border-radius: 9999px; height: 12px;">
                    <div style="height: 12px; border-radius: 9999px; width: ${percent}%; background-color: ${COLOR_MAP[type] || '#3b82f6'}"></div>
                </div>
            </div>
        `;
    }
    breakdownContainer.innerHTML = html;
}

const greenIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const redIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

function setStatus(message, type = 'info') {
    statusArea.textContent = message;
    statusArea.className = type;
}

function clearMap() {
    if (startMarker) {
        map.removeLayer(startMarker);
        startMarker = null;
    }
    if (endMarker) {
        map.removeLayer(endMarker);
        endMarker = null;
    }
    if (routeLayer) {
        map.removeLayer(routeLayer);
        routeLayer = null;
    }
    startInput.value = '';
    endInput.value = '';
    calculateBtn.disabled = true;
    clickState = 0;
    setStatus('Click on the map to place your starting point (green marker).', 'info');
}

function formatCoord(lat, lon) {
    return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

map.on('click', function(e) {
    const lat = e.latlng.lat;
    const lon = e.latlng.lng;
    
    if (clickState === 0) {
        startMarker = L.marker([lat, lon], { icon: greenIcon }).addTo(map);
        startMarker.bindPopup('Start Point').openPopup();
        startInput.value = formatCoord(lat, lon);
        clickState = 1;
        setStatus('Now click to place your destination (red marker).', 'info');
    } else if (clickState === 1) {
        endMarker = L.marker([lat, lon], { icon: redIcon }).addTo(map);
        endMarker.bindPopup('End Point').openPopup();
        endInput.value = formatCoord(lat, lon);
        clickState = 2;
        calculateBtn.disabled = false;
        setStatus('Ready! Click "Calculate Route" to find your path.', 'info');
    } else {
        clearMap();
    }
});

calculateBtn.addEventListener('click', async function() {
    if (!startMarker || !endMarker) {
        setStatus('Please set both start and end points first.', 'error');
        return;
    }
    
    const startCoords = startMarker.getLatLng();
    const endCoords = endMarker.getLatLng();
    
    calculateBtn.disabled = true;
    calculateBtn.textContent = 'Calculating...';
    setStatus('Finding the best walking route...', 'info');
    
    if (routeLayer) {
        map.removeLayer(routeLayer);
        routeLayer = null;
    }
    
    try {
        const response = await fetch('/api/route', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                start: [startCoords.lat, startCoords.lng],
                end: [endCoords.lat, endCoords.lng]
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            routeLayer = L.featureGroup();
            
            if (data.segments && data.segments.length > 0) {
                for (const segment of data.segments) {
                    const coords = segment.coords.map(c => [c[0], c[1]]);
                    const color = COLOR_MAP[segment.type] || '#3b82f6';
                    const polyline = L.polyline(coords, {
                        color: color,
                        weight: 5,
                        opacity: 0.9
                    });
                    routeLayer.addLayer(polyline);
                }
            } else {
                const coordinates = data.path.map(coord => [coord[0], coord[1]]);
                const polyline = L.polyline(coordinates, {
                    color: '#3b82f6',
                    weight: 5,
                    opacity: 0.8
                });
                routeLayer.addLayer(polyline);
            }
            
            routeLayer.addTo(map);
            map.fitBounds(routeLayer.getBounds(), { padding: [50, 50] });
            
            const distanceKm = (data.distance_m / 1000).toFixed(2);
            const elevationGain = Math.round(data.elevation_gain || 0);
            const totalSeconds = data.total_time_s || 0;
            const totalMinutes = Math.round(totalSeconds / 60);
            const hours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;
            const timeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes} min`;
            
            statusArea.innerHTML = '';
            setStatus(`Route found! Distance: ${distanceKm} km | Elevation: +${elevationGain} m | Est. time: ${timeStr}`, 'success');
            
            renderBreakdown(data.breakdown, data.distance_m);
        } else {
            setStatus(`Error: ${data.error}`, 'error');
        }
    } catch (error) {
        setStatus(`Network error: ${error.message}`, 'error');
    } finally {
        calculateBtn.disabled = false;
        calculateBtn.textContent = 'Calculate Route';
    }
});
