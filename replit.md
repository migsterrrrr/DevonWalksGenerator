# Devon Walking Route Planner

## Overview
A walking route planner for Devon, UK using an in-house routing engine with OpenStreetMap data.

## Project Structure
```
├── app/
│   ├── __init__.py
│   ├── graph_builder.py    # Builds NetworkX graph from PostGIS data
│   └── router.py           # RoutePlanner class with Dijkstra routing
├── data/                   # OSM map files (.osm.pbf)
├── main.py                 # FastAPI application
├── init_db.sh              # Database setup script
├── devon_graph.gpickle     # Cached graph (auto-generated)
└── requirements.txt
```

## System Dependencies
Installed via Nix:
- gdal - Reading spatial files
- geos - Geometry engine for shapely
- postgresqlPackages.postgis - PostGIS spatial extension
- osm2pgsql - Tool to import .pbf files into PostgreSQL

## Python Dependencies
- fastapi, uvicorn - Backend API
- sqlalchemy, asyncpg, psycopg2-binary, geoalchemy2 - Database ORM
- osmnx, networkx - Routing and graph analysis
- shapely, geopandas - Geometry processing

## Database
Using Replit's managed PostgreSQL with PostGIS extension.
- Connection: DATABASE_URL environment variable
- Tables: planet_osm_point, planet_osm_line, planet_osm_polygon, planet_osm_roads

## Graph Statistics
- 1,417,290 nodes
- 1,475,010 edges
- Built from 196,656 walkable edges

## API Endpoints
- `GET /` - API status
- `GET /health` - Health check
- `POST /api/route` - Calculate walking route
  - Request: `{"start": [lat, lon], "end": [lat, lon]}`
  - Response: `{"success": true, "path": [[lat, lon], ...], "distance_m": 1234.5}`

## Commands
- `bash init_db.sh` - Re-import OSM data
- `python main.py` - Run FastAPI server on port 5000
