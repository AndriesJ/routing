# RunRoutes - Smart Running Route Generator 🏃

A Progressive Web App (PWA) for creating and discovering running routes with elevation profiles.

## Features

### 🤖 Auto Generate Mode
- **Out & Back Routes**: Automatically generates routes with proper turnaround points at half distance
- **Loop Routes**: Creates circular routes that start and end at the same point
- **Distance Selection**: Choose from 1-42 km with real-time half-distance display
- **Surface Preferences**: Roads, trails, or mixed surfaces
- **Terrain Options**: Flat, moderate, or hilly terrain selection
- **Avoid Highways**: Option to avoid freeways and major roads

### 👤 User Created Mode
- **Manual Route Creation**: Click on the map to create custom routes
- **Point Editing**: Select, drag, and delete individual points
- **Turnaround Points**: Mark any point as a turnaround for automatic out & back calculation
- **Real-time Distance**: Automatically calculates total distance and out & back distances

### 📊 Route Analysis
- **Elevation Profile**: Interactive elevation graph showing terrain along the route
- **Route Statistics**: 
  - Total distance
  - Elevation gain
  - Start/end match indicator
  - Estimated time (based on 5 min/km pace)
- **Waypoint Management**: View and manage all route points

### 💾 Save & Load
- **Local Storage**: Routes are saved in browser's localStorage
- **Export as JSON**: Download routes as JSON files
- **Import Routes**: Load previously saved routes
- **Route Cards**: Visual cards with route details and quick actions

### 📱 PWA Features
- **Installable**: Add to home screen on mobile devices
- **Offline Support**: Access saved routes and cached maps offline
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Background Sync**: Syncs data when connection is restored
- **Push Notifications**: Get updates about new features (optional)

## Installation

### Web Version
Simply visit the website and it works instantly!

### Install as PWA
**On Android (Chrome):**
1. Open the website
2. Tap the menu (three dots)
3. Select "Add to Home screen"
4. Follow the prompts

**On iOS (Safari):**
1. Open the website
2. Tap the share button
3. Select "Add to Home Screen"
4. Name the app and tap "Add"

## Usage Guide

### Auto Generate Mode
1. Select "Auto Generate" mode
2. Set starting point (use current location or pick on map)
3. Choose distance with the slider
4. Select route type (Out & Back or Loop)
5. Pick surface preference
6. Click "Generate Route"

### User Created Mode
1. Switch to "User Created" mode
2. Click "Start Creating"
3. Click on the map to add points
4. Click "Finish" when done
5. Use "Edit Points" to modify:
   - Drag any point to move it
   - Click a point to select it
   - Mark as "Turnaround" for out & back
   - Delete unwanted points

### Saving Routes
1. Enter a route name
2. Click "Save" button
3. Route is saved locally and downloaded as JSON

### Loading Routes
1. Scroll to "Saved Routes" section
2. Click any route card to load it
3. Route appears on map with all data

## Technical Details

### APIs Used
- **OpenStreetMap**: Map tiles and routing
- **OSRM**: Open Source Routing Machine for route calculation
- **Open-Elevation**: Elevation data for terrain profiles

### Browser Support
- Chrome (Android/Desktop): 60+
- Firefox: 55+
- Safari (iOS): 12.2+
- Edge: 79+

### Offline Capabilities
- Cached map tiles (last viewed areas)
- Saved routes from localStorage
- Service Worker for offline asset serving

## Development

### Project Structure