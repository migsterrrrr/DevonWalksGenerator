const map = L.map('map').setView([50.7, -3.5], 10);

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
            const coordinates = data.path.map(coord => [coord[0], coord[1]]);
            
            routeLayer = L.polyline(coordinates, {
                color: '#3b82f6',
                weight: 5,
                opacity: 0.8
            }).addTo(map);
            
            map.fitBounds(routeLayer.getBounds(), { padding: [50, 50] });
            
            const distanceKm = (data.distance_m / 1000).toFixed(2);
            const elevationGain = Math.round(data.elevation_gain || 0);
            const totalSeconds = data.total_time_s || 0;
            const totalMinutes = Math.round(totalSeconds / 60);
            const hours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;
            const timeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes} min`;
            
            setStatus(`Route found! Distance: ${distanceKm} km | Elevation: +${elevationGain} m | Est. time: ${timeStr}`, 'success');
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
