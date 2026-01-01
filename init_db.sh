#!/bin/bash
set -e

echo "=== Devon Walking Route Planner - Database Setup ==="

if [ -z "$DATABASE_URL" ]; then
    echo "ERROR: DATABASE_URL environment variable not set"
    echo "Please ensure the Replit database is created"
    exit 1
fi

echo "Using Replit PostgreSQL database..."
echo "Database: $PGDATABASE"
echo "Host: $PGHOST"

echo ""
echo "Enabling PostGIS extension..."
psql "$DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS postgis;" 2>/dev/null || echo "PostGIS already enabled"
psql "$DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS hstore;" 2>/dev/null || echo "hstore already enabled"

echo ""
echo "Checking for map data file..."
MAP_FILE=""
for f in data/*.osm.pbf data/*.pbf; do
    if [ -f "$f" ]; then
        MAP_FILE="$f"
        break
    fi
done

if [ -z "$MAP_FILE" ]; then
    echo "ERROR: No .osm.pbf file found in data/ directory"
    exit 1
fi

echo "Found map file: $MAP_FILE"
echo ""
echo "Importing OSM data..."
echo "This may take several minutes depending on file size..."

osm2pgsql --slim \
    -d "$DATABASE_URL" \
    --create \
    "$MAP_FILE"

echo ""
echo "=== Database setup complete! ==="
echo ""
echo "Verifying import..."
psql "$DATABASE_URL" -c "SELECT COUNT(*) as roads FROM planet_osm_line WHERE highway IS NOT NULL;"

echo ""
echo "You can now run: python main.py"
