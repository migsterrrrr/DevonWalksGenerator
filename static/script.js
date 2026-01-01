const map = L.map('map').setView([50.7, -3.5], 10);

const roadTypeLabels = {
    'primary': 'A Road',
    'trunk': 'A Road',
    'secondary': 'B Road',
    'tertiary': 'Country Lane',
    'unclassified': 'Country Lane',
    'residential': 'Town Lane',
    'service': 'Town Lane',
    'living_street': 'Town Lane',
    'footway': 'Footpath',
    'path': 'Footpath',
    'bridleway': 'Footpath',
    'track': 'Footpath',
    'cycleway': 'Footpath',
    'steps': 'Footpath',
    'pedestrian': 'Footpath',
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
let elevationChart = null;

const startInput = document.getElementById('start-input');
const endInput = document.getElementById('end-input');
const calculateBtn = document.getElementById('calculate-btn');
const gpxBtn = document.getElementById('gpx-btn');
const shareBtn = document.getElementById('share-btn');
const statusArea = document.getElementById('status-area');
const breakdownContainer = document.getElementById('breakdown-container');
const qrModal = document.getElementById('qr-modal');
const qrCodeContainer = document.getElementById('qr-code');
const closeModalBtn = document.getElementById('close-modal-btn');
let qrCodeInstance = null;

gpxBtn.addEventListener('mouseover', () => {
    gpxBtn.style.borderColor = '#9ca3af';
    gpxBtn.style.color = '#e5e7eb';
});
gpxBtn.addEventListener('mouseout', () => {
    gpxBtn.style.borderColor = '#4b5563';
    gpxBtn.style.color = '#9ca3af';
});

shareBtn.addEventListener('mouseover', () => {
    shareBtn.style.borderColor = '#9ca3af';
    shareBtn.style.color = '#e5e7eb';
});
shareBtn.addEventListener('mouseout', () => {
    shareBtn.style.borderColor = '#4b5563';
    shareBtn.style.color = '#9ca3af';
});

shareBtn.addEventListener('click', () => {
    qrModal.style.display = 'flex';
    qrCodeContainer.innerHTML = '';
    qrCodeInstance = new QRCode(qrCodeContainer, {
        text: window.location.href,
        width: 200,
        height: 200,
        colorDark: '#000000',
        colorLight: '#ffffff'
    });
});

closeModalBtn.addEventListener('click', () => {
    qrModal.style.display = 'none';
});

qrModal.addEventListener('click', (e) => {
    if (e.target === qrModal) {
        qrModal.style.display = 'none';
    }
});

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

function renderElevationChart(elevationProfile) {
    const container = document.getElementById('elevation-container');
    const canvas = document.getElementById('elevation-chart');
    
    if (!elevationProfile || elevationProfile.length === 0) {
        container.style.display = 'none';
        return;
    }
    
    container.style.display = 'block';
    
    if (elevationChart) {
        elevationChart.destroy();
    }
    
    const labels = elevationProfile.map(p => p.distance_km.toFixed(1));
    const data = elevationProfile.map(p => p.elevation_m);
    
    const ctx = canvas.getContext('2d');
    elevationChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                fill: true,
                backgroundColor: 'rgba(74, 222, 128, 0.2)',
                borderColor: '#4ade80',
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 4,
                pointHoverBackgroundColor: '#4ade80',
                pointHoverBorderColor: '#fff',
                pointHoverBorderWidth: 2,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(15, 15, 35, 0.95)',
                    padding: 10,
                    titleColor: '#9ca3af',
                    bodyColor: '#fff',
                    borderColor: 'rgba(74, 222, 128, 0.5)',
                    borderWidth: 1,
                    displayColors: false,
                    callbacks: {
                        title: (items) => `${items[0].label} km`,
                        label: (item) => `${Math.round(item.raw)} m elevation`
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: '#6b7280',
                        font: { size: 10 },
                        maxTicksLimit: 6
                    },
                    title: {
                        display: false
                    }
                },
                y: {
                    display: true,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    border: {
                        display: false
                    },
                    ticks: {
                        color: '#6b7280',
                        font: { size: 10 },
                        padding: 8,
                        callback: (value) => `${value}m`
                    }
                }
            }
        }
    });
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
    gpxBtn.style.display = 'none';
    shareBtn.style.display = 'none';
    clickState = 0;
    setStatus('Click on the map to place your starting point (green marker).', 'info');
    
    const url = new URL(window.location.href);
    url.searchParams.delete('start');
    url.searchParams.delete('end');
    window.history.replaceState({}, '', url.pathname);
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

gpxBtn.addEventListener('click', async function() {
    if (!startMarker || !endMarker) {
        setStatus('Please calculate a route first.', 'error');
        return;
    }
    
    const startCoords = startMarker.getLatLng();
    const endCoords = endMarker.getLatLng();
    
    gpxBtn.textContent = 'Generating...';
    gpxBtn.disabled = true;
    
    try {
        const response = await fetch('/download_gpx', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                start: [startCoords.lat, startCoords.lng],
                end: [endCoords.lat, endCoords.lng]
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to generate GPX');
        }
        
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'route.gpx';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        setStatus('GPX file downloaded! Import it into OS Maps or AllTrails.', 'success');
    } catch (error) {
        setStatus(`GPX download failed: ${error.message}`, 'error');
    } finally {
        gpxBtn.textContent = 'Download GPX (for OS Maps)';
        gpxBtn.disabled = false;
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
    
    gpxBtn.style.display = 'none';
    shareBtn.style.display = 'none';
    
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
            renderElevationChart(data.elevation_profile);
            
            gpxBtn.style.display = 'block';
            shareBtn.style.display = 'block';
            
            const url = new URL(window.location.href);
            url.searchParams.set('start', `${startCoords.lat.toFixed(5)},${startCoords.lng.toFixed(5)}`);
            url.searchParams.set('end', `${endCoords.lat.toFixed(5)},${endCoords.lng.toFixed(5)}`);
            window.history.replaceState({}, '', url.toString());
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

const resizeHandle = document.getElementById('resize-handle');
const sidebar = document.getElementById('sidebar');
let isResizing = false;

resizeHandle.addEventListener('mouseenter', () => {
    resizeHandle.style.background = '#4b5563';
});
resizeHandle.addEventListener('mouseleave', () => {
    if (!isResizing) resizeHandle.style.background = '#2d2d4a';
});

resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    resizeHandle.style.background = '#6b7280';
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
});

window.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    
    const minWidth = 300;
    const maxWidth = 600;
    let newWidth = e.clientX;
    
    if (newWidth < minWidth) newWidth = minWidth;
    if (newWidth > maxWidth) newWidth = maxWidth;
    
    sidebar.style.width = newWidth + 'px';
});

window.addEventListener('mouseup', () => {
    if (isResizing) {
        isResizing = false;
        resizeHandle.style.background = '#2d2d4a';
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        map.invalidateSize();
    }
});

window.addEventListener('load', () => {
    const params = new URLSearchParams(window.location.search);
    const startParam = params.get('start');
    const endParam = params.get('end');
    
    if (startParam && endParam) {
        const [startLat, startLon] = startParam.split(',').map(Number);
        const [endLat, endLon] = endParam.split(',').map(Number);
        
        if (!isNaN(startLat) && !isNaN(startLon) && !isNaN(endLat) && !isNaN(endLon)) {
            startMarker = L.marker([startLat, startLon], { icon: greenIcon }).addTo(map);
            startMarker.bindPopup('Start Point');
            startInput.value = formatCoord(startLat, startLon);
            
            endMarker = L.marker([endLat, endLon], { icon: redIcon }).addTo(map);
            endMarker.bindPopup('End Point');
            endInput.value = formatCoord(endLat, endLon);
            
            clickState = 2;
            calculateBtn.disabled = false;
            
            setTimeout(() => {
                calculateBtn.click();
            }, 500);
        }
    }
});
