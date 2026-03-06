// Handle GitHub Pages base path
const getBasePath = () => {
    if (window.location.hostname.includes('github.io')) {
        const pathParts = window.location.pathname.split('/');
        // Remove empty strings and get the repo name
        const repoName = pathParts[1]; // username.github.io/repo-name/
        return repoName ? `/${repoName}` : '';
    }
    return '';
};

const basePath = getBasePath();
console.log('App base path:', basePath);

// Initialize map
const map = L.map('map').setView([0, 0], 2);

// Add OpenStreetMap tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
}).addTo(map);

// State
let userLocation = null;
let userMarker = null;
let userLocationAccuracy = null;
let startPoint = null;
let routingControl = null;
let elevationChart = null;
let pickingStartPoint = false;
let currentRoute = null;
let savedRoutes = [];
let waypointMarkers = [];
let turnaroundMarker = null;
let editMode = false;
let currentWaypoints = [];
let isGenerating = false;
let currentRouteGeometry = null;
let currentMode = 'auto';
let userRouteActive = false;
let tempUserPoints = [];
let selectedPointIndex = -1;
let turnaroundPointIndex = -1;
let userEditMode = false;

// Check if online/offline
function updateOnlineStatus() {
    const offlineBadge = document.getElementById('offline-badge');
    if (!navigator.onLine) {
        offlineBadge.style.display = 'block';
        showWarning('You are offline. Using cached maps and saved routes.');
    } else {
        offlineBadge.style.display = 'none';
        hideWarning();
    }
}

window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();

// Load saved routes from localStorage
loadSavedRoutes();

// Initialize chart
const ctx = document.getElementById('elevation-chart').getContext('2d');
elevationChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [{
            label: 'Elevation (m)',
            data: [],
            borderColor: '#4CAF50',
            backgroundColor: 'rgba(76, 175, 80, 0.1)',
            tension: 0.4,
            fill: true,
            pointRadius: 2
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false
            },
            tooltip: {
                callbacks: {
                    label: function(context) {
                        return `Elevation: ${context.raw} m`;
                    }
                }
            }
        },
        scales: {
            y: {
                beginAtZero: false,
                title: {
                    display: true,
                    text: 'Elevation (m)'
                },
                grid: {
                    color: 'rgba(0,0,0,0.05)'
                }
            },
            x: {
                title: {
                    display: true,
                    text: 'Distance (km)'
                },
                grid: {
                    display: false
                }
            }
        }
    }
});

// Mode switching
function setMode(mode) {
    currentMode = mode;
    
    document.getElementById('autoMode').style.display = mode === 'auto' ? 'block' : 'none';
    document.getElementById('userMode').style.display = mode === 'user' ? 'block' : 'none';
    
    document.getElementById('autoModeBtn').classList.toggle('active', mode === 'auto');
    document.getElementById('userModeBtn').classList.toggle('active', mode === 'user');
    
    if (mode === 'user') {
        document.getElementById('user-mode').style.display = 'block';
    } else {
        document.getElementById('user-mode').style.display = 'none';
        document.getElementById('userModeIndicator').style.display = 'none';
        userRouteActive = false;
        map.off('click', handleUserMapClick);
        disableUserEditMode();
    }
    
    clearSelectedPoint();
}

// User route functions
function startUserRoute() {
    userRouteActive = true;
    document.getElementById('user-mode').style.display = 'block';
    document.getElementById('startUserBtn').disabled = true;
    document.getElementById('finishUserBtn').disabled = false;
    document.getElementById('userEditBtn').disabled = true;
    document.getElementById('clearUserBtn').disabled = false;
    
    if (!startPoint) {
        if (userLocation) {
            setStartPoint(userLocation.lat, userLocation.lng);
        } else {
            setStartPoint(40.7812, -73.9665);
        }
    }
    
    tempUserPoints = [startPoint.getLatLng()];
    updateUserPointCount();
    
    map.on('click', handleUserMapClick);
    
    showWarning('👤 User Mode: Click on the map to add points to your route');
}

function handleUserMapClick(e) {
    if (!userRouteActive) return;
    
    tempUserPoints.push(e.latlng);
    updateUserPointCount();
    
    const marker = L.marker(e.latlng, {
        icon: L.divIcon({
            className: 'temp-marker',
            html: `<div style="background: #ff9800; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; border: 2px solid white; opacity: 0.7; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">${tempUserPoints.length}</div>`,
            iconSize: [20, 20]
        })
    }).addTo(map);
    
    if (!window.tempMarkers) window.tempMarkers = [];
    window.tempMarkers.push(marker);
}

function finishUserRoute() {
    if (tempUserPoints.length < 2) {
        alert('Add at least 2 points to create a route');
        return;
    }
    
    userRouteActive = false;
    document.getElementById('user-mode').style.display = 'none';
    document.getElementById('startUserBtn').disabled = false;
    document.getElementById('finishUserBtn').disabled = true;
    document.getElementById('userEditBtn').disabled = false;
    
    if (window.tempMarkers) {
        window.tempMarkers.forEach(m => map.removeLayer(m));
        window.tempMarkers = [];
    }
    
    currentWaypoints = tempUserPoints;
    createWaypointMarkers();
    calculateRouteFromWaypoints();
    
    tempUserPoints = [];
    updateUserPointCount();
    
    map.off('click', handleUserMapClick);
    
    showWarning('Route created! You can now edit points or save it.');
}

function clearUserRoute() {
    userRouteActive = false;
    document.getElementById('user-mode').style.display = 'none';
    document.getElementById('startUserBtn').disabled = false;
    document.getElementById('finishUserBtn').disabled = true;
    document.getElementById('userEditBtn').disabled = true;
    
    if (window.tempMarkers) {
        window.tempMarkers.forEach(m => map.removeLayer(m));
        window.tempMarkers = [];
    }
    
    tempUserPoints = [];
    updateUserPointCount();
    
    map.off('click', handleUserMapClick);
    
    clearWaypointsExceptStart();
    disableUserEditMode();
}

function enableUserEditMode() {
    userEditMode = !userEditMode;
    document.getElementById('userEditBtn').textContent = userEditMode ? '✅ Done Editing' : '✏️ Edit Points';
    
    if (userEditMode) {
        makeMarkersDraggable(true);
        showWarning('Edit Mode: Click on any point to select it, or drag to move');
    } else {
        makeMarkersDraggable(false);
        clearSelectedPoint();
        hideWarning();
    }
}

function disableUserEditMode() {
    userEditMode = false;
    document.getElementById('userEditBtn').textContent = '✏️ Edit Points';
    makeMarkersDraggable(false);
    clearSelectedPoint();
}

function makeMarkersDraggable(draggable) {
    waypointMarkers.forEach(marker => {
        if (draggable) {
            marker.dragging.enable();
        } else {
            marker.dragging.disable();
        }
    });
}

function updateUserPointCount() {
    document.getElementById('userPointCount').textContent = tempUserPoints.length;
}

// Point selection and editing
function selectPoint(index) {
    selectedPointIndex = index;
    
    document.querySelectorAll('.waypoint-item').forEach(item => {
        item.classList.remove('selected');
    });
    
    const waypointItems = document.querySelectorAll('.waypoint-item');
    if (waypointItems[index]) {
        waypointItems[index].classList.add('selected');
    }
    
    document.getElementById('editControls').classList.add('active');
    
    const isTurnaround = (index === turnaroundPointIndex);
    setPointTypeUI(isTurnaround ? 'turnaround' : 'regular');
    
    updateTurnaroundInfo();
}

function clearSelectedPoint() {
    selectedPointIndex = -1;
    document.getElementById('editControls').classList.remove('active');
    document.querySelectorAll('.waypoint-item').forEach(item => {
        item.classList.remove('selected');
    });
}

function setPointType(type) {
    if (selectedPointIndex === -1) return;
    
    if (type === 'turnaround') {
        if (turnaroundPointIndex !== -1) {
            const oldMarker = waypointMarkers[turnaroundPointIndex];
            if (oldMarker) {
                updateMarkerStyle(oldMarker, turnaroundPointIndex, false);
            }
        }
        
        turnaroundPointIndex = selectedPointIndex;
        
        const marker = waypointMarkers[selectedPointIndex];
        updateMarkerStyle(marker, selectedPointIndex, true);
        
        showWarning(`Point ${selectedPointIndex + 1} set as turnaround. Total distance will be calculated as out & back.`);
    } else {
        if (selectedPointIndex === turnaroundPointIndex) {
            const marker = waypointMarkers[selectedPointIndex];
            updateMarkerStyle(marker, selectedPointIndex, false);
            turnaroundPointIndex = -1;
        }
    }
    
    setPointTypeUI(type);
    updateTurnaroundInfo();
    updateWaypointsList();
    calculateRouteFromWaypoints();
}

function setPointTypeUI(type) {
    document.getElementById('regularTypeBtn').classList.toggle('selected', type === 'regular');
    document.getElementById('turnaroundTypeBtn').classList.toggle('selected', type === 'turnaround');
}

function updateMarkerStyle(marker, index, isTurnaround) {
    const bgColor = index === 0 ? '#4CAF50' : (isTurnaround ? '#ff9800' : '#2196F3');
    const html = `<div style="background: ${bgColor}; color: white; border-radius: 50%; width: ${isTurnaround ? '36px' : '24px'}; height: ${isTurnaround ? '36px' : '24px'}; display: flex; align-items: center; justify-content: center; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3); ${isTurnaround ? 'animation: pulse 2s infinite;' : ''}">${index + 1}${isTurnaround ? '↺' : ''}</div>`;
    
    marker.setIcon(L.divIcon({
        className: 'waypoint-marker',
        html: html,
        iconSize: [isTurnaround ? 36 : 24, isTurnaround ? 36 : 24]
    }));
}

function updateTurnaroundInfo() {
    const turnaroundInfo = document.getElementById('turnaroundInfo');
    
    if (turnaroundPointIndex !== -1 && turnaroundPointIndex < currentWaypoints.length) {
        let distanceToTurn = 0;
        for (let i = 0; i < turnaroundPointIndex; i++) {
            distanceToTurn += calculateDistance(
                currentWaypoints[i].lat, currentWaypoints[i].lng,
                currentWaypoints[i + 1].lat, currentWaypoints[i + 1].lng
            );
        }
        
        const totalOutBack = distanceToTurn * 2;
        
        document.getElementById('distanceToTurnaround').textContent = distanceToTurn.toFixed(2);
        document.getElementById('totalOutBackDistance').textContent = totalOutBack.toFixed(2);
        
        turnaroundInfo.style.display = 'block';
        
        document.getElementById('distance-display').innerHTML = `${totalOutBack.toFixed(2)} km <span style="color:#ff9800; font-size:0.8rem;">(out & back)</span>`;
    } else {
        turnaroundInfo.style.display = 'none';
    }
}

function deleteSelectedPoint() {
    if (selectedPointIndex > 0) {
        removeWaypoint(selectedPointIndex);
        clearSelectedPoint();
    } else if (selectedPointIndex === 0) {
        showWarning('Cannot delete starting point. Drag to move it instead.');
    }
}

// Get user location
function getUserLocation() {
    const locationStatus = document.getElementById('location-status');
    
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                userLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy: position.coords.accuracy
                };
                
                locationStatus.textContent = '📍 Location detected';
                locationStatus.style.backgroundColor = 'rgba(76, 175, 80, 0.3)';
                
                map.setView([userLocation.lat, userLocation.lng], 14);
                
                updateUserLocationMarker();
                
                setStartPoint(userLocation.lat, userLocation.lng);
            },
            (error) => {
                console.error('Error getting location:', error);
                locationStatus.textContent = '📍 Location unavailable';
                locationStatus.style.backgroundColor = 'rgba(244, 67, 54, 0.3)';
                
                const defaultLocation = { lat: 40.7812, lng: -73.9665 };
                map.setView([defaultLocation.lat, defaultLocation.lng], 14);
                setStartPoint(defaultLocation.lat, defaultLocation.lng);
            },
            {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
            }
        );
    } else {
        locationStatus.textContent = '📍 Geolocation not supported';
        locationStatus.style.backgroundColor = 'rgba(244, 67, 54, 0.3)';
        const defaultLocation = { lat: 40.7812, lng: -73.9665 };
        map.setView([defaultLocation.lat, defaultLocation.lng], 14);
        setStartPoint(defaultLocation.lat, defaultLocation.lng);
    }
}

function updateUserLocationMarker() {
    if (!userLocation) return;
    
    if (userMarker) {
        map.removeLayer(userMarker);
    }
    
    if (userLocationAccuracy) {
        map.removeLayer(userLocationAccuracy);
    }
    
    userMarker = L.circleMarker([userLocation.lat, userLocation.lng], {
        radius: 10,
        fillColor: '#2196F3',
        color: 'white',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8
    }).addTo(map);
    
    userLocationAccuracy = L.circle([userLocation.lat, userLocation.lng], {
        radius: userLocation.accuracy,
        color: '#2196F3',
        weight: 1,
        opacity: 0.3,
        fillOpacity: 0.1
    }).addTo(map);
    
    userMarker.bindPopup('You are here').openPopup();
}

function useCurrentLocation() {
    if (userLocation) {
        setStartPoint(userLocation.lat, userLocation.lng);
        map.setView([userLocation.lat, userLocation.lng], 14);
    } else {
        alert('Location not available. Please enable location services.');
    }
}

function setStartPointOnMap() {
    pickingStartPoint = true;
    map.getContainer().style.cursor = 'crosshair';
    showWarning('Click on the map to set your starting point');
}

function setStartPoint(lat, lng) {
    if (startPoint) {
        map.removeLayer(startPoint);
    }
    
    startPoint = L.marker([lat, lng], {
        icon: L.divIcon({
            className: 'start-marker',
            html: '<div style="background: #4CAF50; color: white; border-radius: 50%; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">🏁</div>',
            iconSize: [30, 30]
        })
    }).addTo(map);
    
    startPoint.bindPopup('Starting Point').openPopup();
    
    if (currentWaypoints.length === 0) {
        currentWaypoints = [L.latLng(lat, lng)];
        createWaypointMarkers();
    } else {
        currentWaypoints[0] = L.latLng(lat, lng);
        updateWaypointMarker(0);
    }
}

function updateWaypointMarker(index) {
    if (index >= 0 && index < waypointMarkers.length) {
        waypointMarkers[index].setLatLng(currentWaypoints[index]);
    }
}

map.on('click', function(e) {
    if (pickingStartPoint) {
        setStartPoint(e.latlng.lat, e.latlng.lng);
        pickingStartPoint = false;
        map.getContainer().style.cursor = '';
        hideWarning();
    }
});

function updateDistanceLabel(value) {
    document.getElementById('distance-value').textContent = value + ' km';
    document.getElementById('half-distance').textContent = (value / 2).toFixed(1) + ' km';
}

function showWarning(message) {
    const warning = document.getElementById('warning');
    warning.textContent = message;
    warning.style.display = 'block';
}

function hideWarning() {
    document.getElementById('warning').style.display = 'none';
}

// Auto generate functions
async function generateOutAndBackRoute(start, targetDistance, surface, avoidHighways) {
    showWarning('Finding best out & back route...');
    
    const halfDistance = targetDistance / 2;
    let bestRoute = null;
    let bestRouteData = null;
    let bestDistanceDiff = Infinity;
    let bestTurnaroundPoint = null;
    
    const directions = [0, 45, 90, 135, 180, 225, 270, 315];
    
    for (const direction of directions) {
        const potentialTurnPoint = calculateDestination(start, halfDistance, direction);
        const routeToTurn = await getRouteBetweenPoints(start, potentialTurnPoint, surface, avoidHighways);
        
        if (routeToTurn && routeToTurn.routes && routeToTurn.routes.length > 0) {
            const routeToTurnData = routeToTurn.routes[0];
            const routeToTurnDistance = routeToTurnData.distance / 1000;
            
            const distanceDiff = Math.abs(routeToTurnDistance - halfDistance);
            
            if (distanceDiff < bestDistanceDiff) {
                bestDistanceDiff = distanceDiff;
                
                const routeCoords = routeToTurnData.geometry.coordinates;
                const actualEndPoint = L.latLng(routeCoords[routeCoords.length - 1][1], routeCoords[routeCoords.length - 1][0]);
                
                const routeBack = await getRouteBetweenPoints(actualEndPoint, start, surface, avoidHighways);
                
                if (routeBack && routeBack.routes && routeBack.routes.length > 0) {
                    const routeBackData = routeBack.routes[0];
                    const totalDistance = (routeToTurnDistance + (routeBackData.distance / 1000));
                    
                    const combinedCoords = [
                        ...routeToTurnData.geometry.coordinates,
                        ...routeBackData.geometry.coordinates.slice(1)
                    ];
                    
                    bestRoute = {
                        routes: [{
                            distance: totalDistance * 1000,
                            geometry: {
                                coordinates: combinedCoords,
                                type: 'LineString'
                            }
                        }]
                    };
                    
                    bestRouteData = {
                        routeToTurn: routeToTurnData,
                        routeBack: routeBackData,
                        turnPoint: actualEndPoint,
                        halfDistance: routeToTurnDistance
                    };
                    
                    bestTurnaroundPoint = actualEndPoint;
                }
            }
        }
    }
    
    if (bestRoute && bestTurnaroundPoint) {
        const waypoints = extractWaypointsFromRouteGeometry(bestRoute.routes[0].geometry.coordinates);
        addTurnaroundMarker(bestTurnaroundPoint);
        
        return {
            route: bestRoute,
            waypoints: waypoints,
            turnPoint: bestTurnaroundPoint,
            halfDistance: bestRouteData.halfDistance
        };
    }
    
    return null;
}

async function generateLoopRoute(start, targetDistance, surface, avoidHighways) {
    showWarning('Finding best loop route...');
    
    let bestRoute = null;
    let bestWaypoints = null;
    let bestDistanceDiff = Infinity;
    
    const segmentOptions = [4, 5, 6, 8];
    
    for (const numSegments of segmentOptions) {
        const potentialWaypoints = generateLoopWaypoints(start, targetDistance, numSegments);
        const route = await getRouteForWaypoints(potentialWaypoints, surface, avoidHighways);
        
        if (route && route.routes && route.routes.length > 0) {
            const routeData = route.routes[0];
            const routeDistance = routeData.distance / 1000;
            const distanceDiff = Math.abs(routeDistance - targetDistance);
            
            const coords = routeData.geometry.coordinates;
            const endPoint = L.latLng(coords[coords.length - 1][1], coords[coords.length - 1][0]);
            const startPoint = L.latLng(coords[0][1], coords[0][0]);
            const endToStartDistance = calculateDistance(endPoint.lat, endPoint.lng, startPoint.lat, startPoint.lng);
            
            if (endToStartDistance < 0.1 && distanceDiff < bestDistanceDiff) {
                bestDistanceDiff = distanceDiff;
                const waypoints = extractWaypointsFromRouteGeometry(coords);
                bestRoute = route;
                bestWaypoints = waypoints;
            }
        }
    }
    
    if (bestRoute) {
        return {
            route: bestRoute,
            waypoints: bestWaypoints
        };
    }
    
    return null;
}

function generateLoopWaypoints(start, targetDistance, numSegments) {
    const waypoints = [start];
    const segmentDistance = targetDistance / numSegments;
    let currentAngle = Math.random() * 360;
    
    for (let i = 1; i <= numSegments; i++) {
        currentAngle += 360 / numSegments;
        const angleVariation = (Math.random() - 0.5) * 30;
        const distanceVariation = segmentDistance * (0.8 + Math.random() * 0.4);
        
        const point = calculateDestination(
            waypoints[waypoints.length - 1], 
            distanceVariation, 
            currentAngle + angleVariation
        );
        
        waypoints.push(point);
    }
    
    waypoints.push(start);
    return waypoints;
}

function calculateDestination(start, distance, angle) {
    const R = 6371;
    const bearing = angle * Math.PI / 180;
    
    const lat1 = start.lat * Math.PI / 180;
    const lon1 = start.lng * Math.PI / 180;
    
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(distance/R) + 
                Math.cos(lat1) * Math.sin(distance/R) * Math.cos(bearing));
    
    const lon2 = lon1 + Math.atan2(Math.sin(bearing) * Math.sin(distance/R) * Math.cos(lat1), 
                        Math.cos(distance/R) - Math.sin(lat1) * Math.sin(lat2));
    
    return L.latLng(lat2 * 180 / Math.PI, lon2 * 180 / Math.PI);
}

async function getRouteBetweenPoints(start, end, surface, avoidHighways) {
    const profile = surface === 'trail' ? 'foot' : 'cycling';
    const url = `https://router.project-osrm.org/route/v1/${profile}/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson&alternatives=false&steps=true`;
    
    try {
        const response = await fetch(url);
        if (response.ok) {
            return await response.json();
        }
    } catch (error) {
        console.error('Error getting route:', error);
    }
    
    return null;
}

async function getRouteForWaypoints(waypoints, surface, avoidHighways) {
    if (waypoints.length < 2) return null;
    
    const coordinates = waypoints.map(wp => `${wp.lng},${wp.lat}`).join(';');
    const profile = surface === 'trail' ? 'foot' : 'cycling';
    
    const url = `https://router.project-osrm.org/route/v1/${profile}/${coordinates}?overview=full&geometries=geojson&alternatives=false&steps=true`;
    
    try {
        const response = await fetch(url);
        if (response.ok) {
            return await response.json();
        }
    } catch (error) {
        console.error('Error getting route:', error);
    }
    
    return null;
}

function extractWaypointsFromRouteGeometry(coordinates) {
    const waypoints = [];
    const step = Math.max(1, Math.floor(coordinates.length / 12));
    
    for (let i = 0; i < coordinates.length; i += step) {
        waypoints.push(L.latLng(coordinates[i][1], coordinates[i][0]));
    }
    
    const lastCoord = coordinates[coordinates.length - 1];
    const lastPoint = L.latLng(lastCoord[1], lastCoord[0]);
    
    if (waypoints.length === 0 || 
        calculateDistance(waypoints[waypoints.length - 1].lat, waypoints[waypoints.length - 1].lng, 
                        lastPoint.lat, lastPoint.lng) > 0.01) {
        waypoints.push(lastPoint);
    }
    
    return waypoints;
}

async function generateRoute() {
    if (!startPoint) {
        alert('Please set a starting point first');
        return;
    }

    if (isGenerating) return;
    
    isGenerating = true;
    document.getElementById('loading').style.display = 'block';
    document.getElementById('generateBtn').disabled = true;

    const targetDistance = parseFloat(document.getElementById('distance').value);
    const routeType = document.querySelector('input[name="routeType"]:checked').value;
    const surface = document.querySelector('input[name="surface"]:checked').value;
    const avoidHighways = document.getElementById('avoidHighways').checked;

    try {
        clearWaypointsExceptStart();
        
        let result;
        
        if (routeType === 'outback') {
            result = await generateOutAndBackRoute(startPoint.getLatLng(), targetDistance, surface, avoidHighways);
            
            if (result) {
                currentWaypoints = result.waypoints;
                currentRouteGeometry = result.route.routes[0].geometry.coordinates;
                createWaypointMarkers();
                await displayRoute(result.route);
                
                const actualDistance = result.route.routes[0].distance / 1000;
                document.getElementById('distance-display').textContent = actualDistance.toFixed(2) + ' km';
                
                if (Math.abs(result.halfDistance - targetDistance/2) > 0.5) {
                    showWarning(`Half distance is ${result.halfDistance.toFixed(1)}km (target ${(targetDistance/2).toFixed(1)}km)`);
                }
            }
        } else {
            result = await generateLoopRoute(startPoint.getLatLng(), targetDistance, surface, avoidHighways);
            
            if (result) {
                currentWaypoints = result.waypoints;
                currentRouteGeometry = result.route.routes[0].geometry.coordinates;
                createWaypointMarkers();
                await displayRoute(result.route);
            }
        }
        
        if (!result) {
            showWarning('Could not find suitable route. Try different settings or use edit mode to adjust.');
            
            if (routeType === 'outback') {
                generateSimpleOutAndBack(startPoint.getLatLng(), targetDistance);
            } else {
                generateSimpleLoop(startPoint.getLatLng(), targetDistance);
            }
        }
        
        checkStartEndMatch();
        
    } catch (error) {
        console.error('Error generating route:', error);
        showWarning('Error generating route. Using simplified route.');
        
        if (routeType === 'outback') {
            generateSimpleOutAndBack(startPoint.getLatLng(), targetDistance);
        } else {
            generateSimpleLoop(startPoint.getLatLng(), targetDistance);
        }
    } finally {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('generateBtn').disabled = false;
        isGenerating = false;
    }
}

function generateSimpleOutAndBack(start, targetDistance) {
    const halfDistance = targetDistance / 2;
    const direction = Math.random() * 360;
    const turnPoint = calculateDestination(start, halfDistance, direction);
    
    currentWaypoints = [start, turnPoint, start];
    createWaypointMarkers();
    
    addTurnaroundMarker(turnPoint);
    
    document.getElementById('distance-display').textContent = targetDistance.toFixed(2) + ' km (approx)';
    drawStraightLineRoute();
}

function generateSimpleLoop(start, targetDistance) {
    const numPoints = 6;
    const waypoints = [start];
    const segmentDistance = targetDistance / numPoints;
    let currentAngle = Math.random() * 360;
    
    for (let i = 1; i <= numPoints; i++) {
        currentAngle += 60;
        const point = calculateDestination(
            waypoints[waypoints.length - 1], 
            segmentDistance, 
            currentAngle
        );
        waypoints.push(point);
    }
    
    waypoints.push(start);
    currentWaypoints = waypoints;
    createWaypointMarkers();
    
    document.getElementById('distance-display').textContent = targetDistance.toFixed(2) + ' km (approx)';
    drawStraightLineRoute();
}

async function displayRoute(route) {
    if (!route || !route.routes || !route.routes[0]) return;
    
    if (routingControl) {
        map.removeControl(routingControl);
    }
    
    map.eachLayer((layer) => {
        if (layer instanceof L.Polyline && !(layer instanceof L.Marker)) {
            map.removeLayer(layer);
        }
    });
    
    const routeData = route.routes[0];
    const coordinates = routeData.geometry.coordinates.map(coord => [coord[1], coord[0]]);
    const polyline = L.polyline(coordinates, {
        color: '#4CAF50',
        weight: 4,
        opacity: 0.7
    }).addTo(map);
    
    map.fitBounds(polyline.getBounds(), { padding: [50, 50] });
    
    currentRoute = routeData;
    currentRouteGeometry = routeData.geometry.coordinates;
    
    await getElevationData(routeData.geometry.coordinates);
    
    const distance = (routeData.distance / 1000).toFixed(2);
    document.getElementById('distance-display').textContent = distance + ' km';
}

async function calculateRouteFromWaypoints() {
    if (currentWaypoints.length < 2) {
        clearRouteLine();
        return;
    }

    document.getElementById('loading').style.display = 'block';

    try {
        if (routingControl) {
            map.removeControl(routingControl);
        }
        
        map.eachLayer((layer) => {
            if (layer instanceof L.Polyline && !(layer instanceof L.Marker)) {
                map.removeLayer(layer);
            }
        });

        const surface = document.querySelector(currentMode === 'auto' ? 'input[name="surface"]:checked' : 'input[name="userSurface"]:checked')?.value || 'road';
        const profile = surface === 'trail' ? 'foot' : 'cycling';
        
        const coordinates = currentWaypoints.map(wp => `${wp.lng},${wp.lat}`).join(';');
        const url = `https://router.project-osrm.org/route/v1/${profile}/${coordinates}?overview=full&geometries=geojson&alternatives=false&steps=true`;
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error('Routing service error');
        }
        
        const data = await response.json();
        
        if (data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            currentRoute = route;
            currentRouteGeometry = route.geometry.coordinates;
            
            const coordinates = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);
            const polyline = L.polyline(coordinates, {
                color: '#4CAF50',
                weight: 4,
                opacity: 0.7
            }).addTo(map);
            
            map.fitBounds(polyline.getBounds(), { padding: [50, 50] });
            
            await getElevationData(route.geometry.coordinates);
            
            const distance = (route.distance / 1000).toFixed(2);
            
            if (turnaroundPointIndex !== -1) {
                updateTurnaroundInfo();
            } else {
                document.getElementById('distance-display').textContent = distance + ' km';
            }
            
            checkStartEndMatch();
        }
    } catch (error) {
        console.error('Error calculating route:', error);
        showWarning('Error calculating route. Using straight lines.');
        drawStraightLineRoute();
    } finally {
        document.getElementById('loading').style.display = 'none';
    }
}

function drawStraightLineRoute() {
    map.eachLayer((layer) => {
        if (layer instanceof L.Polyline && !(layer instanceof L.Marker)) {
            map.removeLayer(layer);
        }
    });
    
    if (currentWaypoints.length < 2) return;
    
    const latlngs = currentWaypoints.map(wp => [wp.lat, wp.lng]);
    const polyline = L.polyline(latlngs, {
        color: '#4CAF50',
        weight: 4,
        opacity: 0.7,
        dashArray: '5, 5'
    }).addTo(map);
    
    map.fitBounds(polyline.getBounds(), { padding: [50, 50] });
    
    let totalDistance = 0;
    for (let i = 0; i < currentWaypoints.length - 1; i++) {
        totalDistance += calculateDistance(
            currentWaypoints[i].lat, currentWaypoints[i].lng,
            currentWaypoints[i + 1].lat, currentWaypoints[i + 1].lng
        );
    }
    
    if (turnaroundPointIndex !== -1) {
        updateTurnaroundInfo();
    } else {
        document.getElementById('distance-display').textContent = totalDistance.toFixed(2) + ' km (approx)';
    }
}

function checkStartEndMatch() {
    const startEndMatch = document.getElementById('start-end-match');
    
    if (currentWaypoints.length < 2) {
        startEndMatch.textContent = '⏳';
        startEndMatch.style.color = '#666';
        return;
    }
    
    const start = currentWaypoints[0];
    const end = currentWaypoints[currentWaypoints.length - 1];
    
    const distance = calculateDistance(start.lat, start.lng, end.lat, end.lng);
    
    if (distance < 0.1) {
        startEndMatch.textContent = '✅ Match';
        startEndMatch.style.color = '#4CAF50';
    } else {
        startEndMatch.textContent = '❌ No match';
        startEndMatch.style.color = '#ff4444';
    }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

async function getElevationData(coordinates) {
    try {
        const step = Math.max(1, Math.floor(coordinates.length / 100));
        const sampledCoords = [];
        
        for (let i = 0; i < coordinates.length; i += step) {
            sampledCoords.push({
                latitude: coordinates[i][1],
                longitude: coordinates[i][0]
            });
        }
        
        if (sampledCoords.length === 0) return;
        
        const lastCoord = coordinates[coordinates.length - 1];
        if (sampledCoords[sampledCoords.length - 1].latitude !== lastCoord[1]) {
            sampledCoords.push({
                latitude: lastCoord[1],
                longitude: lastCoord[0]
            });
        }
        
        const response = await fetch('https://api.open-elevation.com/api/v1/lookup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ locations: sampledCoords })
        });
        
        const data = await response.json();
        
        if (data.results && data.results.length > 0) {
            const distances = [0];
            const elevations = [data.results[0].elevation];
            
            for (let i = 1; i < data.results.length; i++) {
                const prev = sampledCoords[i - 1];
                const curr = sampledCoords[i];
                
                const d = calculateDistance(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
                distances.push(distances[i - 1] + d);
                elevations.push(data.results[i].elevation);
            }
            
            updateElevationChart(distances, elevations);
            
            const maxElev = Math.max(...elevations);
            const minElev = Math.min(...elevations);
            let gain = 0;
            
            for (let i = 1; i < elevations.length; i++) {
                if (elevations[i] > elevations[i - 1]) {
                    gain += elevations[i] - elevations[i - 1];
                }
            }
            
            document.getElementById('max-elevation').textContent = Math.round(maxElev) + ' m';
            document.getElementById('elevation-gain').textContent = Math.round(gain) + ' m';
            
            const totalDistance = distances[distances.length - 1];
            const estimatedTime = Math.round(totalDistance * 5);
            document.getElementById('estimated-time').textContent = estimatedTime + ' min';
        }
    } catch (error) {
        console.error('Error getting elevation data:', error);
    }
}

function updateElevationChart(distances, elevations) {
    elevationChart.data.labels = distances.map(d => d.toFixed(1));
    elevationChart.data.datasets[0].data = elevations;
    elevationChart.update();
}

function clearRouteLine() {
    map.eachLayer((layer) => {
        if (layer instanceof L.Polyline && !(layer instanceof L.Marker)) {
            map.removeLayer(layer);
        }
    });
    
    elevationChart.data.labels = [];
    elevationChart.data.datasets[0].data = [];
    elevationChart.update();
    
    document.getElementById('distance-display').textContent = '0 km';
    document.getElementById('elevation-gain').textContent = '0 m';
    document.getElementById('max-elevation').textContent = '0 m';
    document.getElementById('estimated-time').textContent = '0 min';
    document.getElementById('start-end-match').textContent = '⏳';
}

function clearWaypointsExceptStart() {
    for (let i = 1; i < waypointMarkers.length; i++) {
        map.removeLayer(waypointMarkers[i]);
    }
    
    if (waypointMarkers.length > 0) {
        waypointMarkers = [waypointMarkers[0]];
        currentWaypoints = [currentWaypoints[0]];
    } else {
        waypointMarkers = [];
        currentWaypoints = [];
    }
    
    if (turnaroundMarker) {
        map.removeLayer(turnaroundMarker);
        turnaroundMarker = null;
    }
    
    turnaroundPointIndex = -1;
    updateWaypointsList();
}

function clearWaypoints() {
    waypointMarkers.forEach(marker => map.removeLayer(marker));
    waypointMarkers = [];
    currentWaypoints = [];
    
    if (turnaroundMarker) {
        map.removeLayer(turnaroundMarker);
        turnaroundMarker = null;
    }
    
    turnaroundPointIndex = -1;
    updateWaypointsList();
}

function createWaypointMarkers() {
    waypointMarkers.forEach(marker => map.removeLayer(marker));
    waypointMarkers = [];
    
    const maxMarkers = 15;
    const step = Math.max(1, Math.floor(currentWaypoints.length / maxMarkers));
    
    for (let i = 0; i < currentWaypoints.length; i += step) {
        const waypoint = currentWaypoints[i];
        const isTurnaround = (i === turnaroundPointIndex);
        const bgColor = i === 0 ? '#4CAF50' : (isTurnaround ? '#ff9800' : '#2196F3');
        
        const marker = L.marker(waypoint, {
            draggable: userEditMode,
            icon: L.divIcon({
                className: 'waypoint-marker',
                html: `<div style="background: ${bgColor}; color: white; border-radius: 50%; width: ${isTurnaround ? '36px' : '24px'}; height: ${isTurnaround ? '36px' : '24px'}; display: flex; align-items: center; justify-content: center; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3); ${isTurnaround ? 'animation: pulse 2s infinite;' : ''}">${i + 1}${isTurnaround ? '↺' : ''}</div>`,
                iconSize: [isTurnaround ? 36 : 24, isTurnaround ? 36 : 24]
            })
        }).addTo(map);
        
        marker.on('dragend', function(e) {
            const index = currentWaypoints.findIndex(wp => 
                Math.abs(wp.lat - waypoint.lat) < 0.0001 && 
                Math.abs(wp.lng - waypoint.lng) < 0.0001
            );
            if (index !== -1) {
                currentWaypoints[index] = e.target.getLatLng();
                calculateRouteFromWaypoints();
            }
        });
        
        marker.on('click', function() {
            if (userEditMode) {
                const index = currentWaypoints.findIndex(wp => 
                    Math.abs(wp.lat - waypoint.lat) < 0.0001 && 
                    Math.abs(wp.lng - waypoint.lng) < 0.0001
                );
                if (index !== -1) {
                    selectPoint(index);
                }
            }
        });
        
        waypointMarkers.push(marker);
    }
    
    document.getElementById('waypoint-count').textContent = `(${currentWaypoints.length} points, showing ${waypointMarkers.length})`;
    updateWaypointsList();
}

function updateWaypointsList() {
    const container = document.getElementById('waypoints');
    container.innerHTML = '';
    
    currentWaypoints.forEach((waypoint, index) => {
        const div = document.createElement('div');
        div.className = 'waypoint-item';
        if (index === turnaroundPointIndex) {
            div.classList.add('turnaround');
        }
        div.onclick = () => {
            if (userEditMode) {
                selectPoint(index);
            }
        };
        
        const isTurnaround = (index === turnaroundPointIndex);
        const turnLabel = isTurnaround ? '<span class="turnaround-badge">↺ Turnaround</span>' : '';
        
        div.innerHTML = `
            <span>
                <strong>Point ${index + 1}</strong> ${turnLabel}<br>
                <small>${waypoint.lat.toFixed(4)}, ${waypoint.lng.toFixed(4)}</small>
            </span>
            <div class="waypoint-actions">
                ${index > 0 ? '<span class="remove-waypoint" onclick="event.stopPropagation(); removeWaypoint(' + index + ')">✕</span>' : ''}
            </div>
        `;
        
        container.appendChild(div);
    });
}

function removeWaypoint(index) {
    if (index === 0) {
        showWarning('Cannot remove starting point. Drag to move it instead.');
        return;
    }
    
    if (index === turnaroundPointIndex) {
        turnaroundPointIndex = -1;
    }
    
    currentWaypoints.splice(index, 1);
    createWaypointMarkers();
    calculateRouteFromWaypoints();
    clearSelectedPoint();
}

function addPointAtEnd() {
    if (currentWaypoints.length > 0) {
        const lastPoint = currentWaypoints[currentWaypoints.length - 1];
        const newPoint = L.latLng(
            lastPoint.lat + 0.001,
            lastPoint.lng + 0.001
        );
        
        currentWaypoints.push(newPoint);
        createWaypointMarkers();
        calculateRouteFromWaypoints();
    }
}

function addTurnaroundMarker(point) {
    if (turnaroundMarker) {
        map.removeLayer(turnaroundMarker);
    }
    
    turnaroundMarker = L.marker(point, {
        icon: L.divIcon({
            className: 'turnaround-marker',
            html: '<div style="background: #ff9800; color: white; border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border: 3px solid white; font-weight: bold; font-size: 18px; box-shadow: 0 2px 5px rgba(0,0,0,0.3); animation: pulse 2s infinite;">↺</div>',
            iconSize: [36, 36]
        })
    }).addTo(map);
    
    turnaroundMarker.bindPopup('Turnaround Point<br>Half distance').openPopup();
}

function clearRoute() {
    clearWaypoints();
    clearRouteLine();
    
    if (startPoint) {
        currentWaypoints = [startPoint.getLatLng()];
        createWaypointMarkers();
    }
}

// Save/Load functions
function saveRoute() {
    if (currentWaypoints.length < 2) {
        alert('No route to save');
        return;
    }

    const routeName = document.getElementById('routeName')?.value || 'My Route';
    const targetDistance = parseFloat(document.getElementById('distance')?.value || 0);
    const actualDistance = document.getElementById('distance-display').textContent;

    const routeData = {
        id: Date.now(),
        name: routeName,
        waypoints: currentWaypoints.map(wp => ({ lat: wp.lat, lng: wp.lng })),
        geometry: currentRouteGeometry,
        targetDistance: targetDistance,
        actualDistance: actualDistance,
        timestamp: new Date().toISOString(),
        routeType: document.querySelector('input[name="routeType"]:checked')?.value || 'user',
        surface: document.querySelector(currentMode === 'auto' ? 'input[name="surface"]:checked' : 'input[name="userSurface"]:checked')?.value || 'road',
        difficulty: document.getElementById('difficulty')?.value || 'moderate',
        mode: currentMode,
        turnaroundPointIndex: turnaroundPointIndex
    };

    savedRoutes.push(routeData);
    localStorage.setItem('savedRoutes', JSON.stringify(savedRoutes));

    const blob = new Blob([JSON.stringify(routeData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `route-${new Date().toISOString().slice(0,10)}.json`;
    a.click();

    updateSavedRoutesList();
    
    // Trigger background sync if available
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
        navigator.serviceWorker.ready.then(reg => {
            reg.sync.register('sync-routes');
        });
    }
}

function loadSavedRoutes() {
    const saved = localStorage.getItem('savedRoutes');
    if (saved) {
        savedRoutes = JSON.parse(saved);
        updateSavedRoutesList();
    }
}

function updateSavedRoutesList() {
    const container = document.getElementById('saved-routes-list');
    container.innerHTML = '';

    savedRoutes.slice(0, 5).forEach((route, index) => {
        const card = document.createElement('div');
        card.className = 'route-card';
        
        const typeIcon = route.mode === 'user' ? '👤' : (route.routeType === 'outback' ? '↪️' : '🔄');
        const turnaroundIcon = route.turnaroundPointIndex !== undefined && route.turnaroundPointIndex !== -1 ? ' ↺' : '';
        
        card.innerHTML = `
            <h4>${typeIcon} ${route.name}${turnaroundIcon}</h4>
            <p>📏 ${typeof route.actualDistance === 'string' ? route.actualDistance : route.actualDistance.toFixed(2) + ' km'} · ${route.surface}</p>
            <div class="route-card-actions">
                <span class="route-card-action download" onclick="loadSavedRoute(${index})">📂 Load</span>
                <span class="route-card-action delete" onclick="deleteSavedRoute(${index})">🗑️</span>
            </div>
        `;
        
        container.appendChild(card);
    });
}

function loadSavedRoute(index) {
    const route = savedRoutes[index];
    clearWaypoints();
    
    currentWaypoints = route.waypoints.map(wp => L.latLng(wp.lat, wp.lng));
    currentRouteGeometry = route.geometry;
    
    if (route.turnaroundPointIndex !== undefined) {
        turnaroundPointIndex = route.turnaroundPointIndex;
    }
    
    createWaypointMarkers();
    
    if (currentWaypoints.length > 0) {
        setStartPoint(currentWaypoints[0].lat, currentWaypoints[0].lng);
    }
    
    if (currentRouteGeometry) {
        const coordinates = currentRouteGeometry.map(coord => [coord[1], coord[0]]);
        const polyline = L.polyline(coordinates, {
            color: '#4CAF50',
            weight: 4,
            opacity: 0.7
        }).addTo(map);
        
        map.fitBounds(polyline.getBounds(), { padding: [50, 50] });
        
        document.getElementById('distance-display').textContent = 
            typeof route.actualDistance === 'string' ? route.actualDistance : route.actualDistance.toFixed(2) + ' km';
        getElevationData(currentRouteGeometry);
    } else {
        calculateRouteFromWaypoints();
    }
    
    if (route.mode === 'user') {
        setMode('user');
    } else {
        setMode('auto');
        if (route.targetDistance) {
            document.getElementById('distance').value = route.targetDistance;
            updateDistanceLabel(route.targetDistance);
        }
    }
    
    if (document.getElementById('routeName')) {
        document.getElementById('routeName').value = route.name;
    }
}

function deleteSavedRoute(index) {
    if (confirm('Delete this saved route?')) {
        savedRoutes.splice(index, 1);
        localStorage.setItem('savedRoutes', JSON.stringify(savedRoutes));
        updateSavedRoutesList();
    }
}

// Initialize
getUserLocation();

// Route option selection styling
document.querySelectorAll('.route-option').forEach(option => {
    option.addEventListener('click', function() {
        document.querySelectorAll('.route-option').forEach(opt => {
            opt.classList.remove('selected');
        });
        this.classList.add('selected');
        this.querySelector('input').checked = true;
    });
});

// Surface option selection styling
document.querySelectorAll('.surface-option').forEach(option => {
    option.addEventListener('click', function() {
        const parent = this.closest('.surface-options');
        parent.querySelectorAll('.surface-option').forEach(opt => {
            opt.classList.remove('selected');
        });
        this.classList.add('selected');
        this.querySelector('input').checked = true;
    });
});

document.getElementById('distance').addEventListener('input', function(e) {
    updateDistanceLabel(e.target.value);
});