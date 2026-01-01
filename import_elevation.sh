#!/bin/bash
set -e

echo "=== Devon Elevation Data Import ==="
echo ""

echo "Step 1: Enable postgis_raster extension..."
psql "$DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS postgis_raster;"
echo "Done."

echo ""
echo "Step 2: Drop existing elevation_data table..."
psql "$DATABASE_URL" -c "DROP TABLE IF EXISTS elevation_data CASCADE;"
echo "Done."

echo ""
echo "Step 3: Importing Devon elevation files (sx*, ss*, st*, sy*)..."

DEVON_FILES=$(ls data/elevation/sx*.asc data/elevation/ss*.asc data/elevation/st*.asc data/elevation/sy*.asc 2>/dev/null)
FILE_COUNT=$(echo "$DEVON_FILES" | wc -l)
echo "Found $FILE_COUNT files to import."

raster2pgsql -s 27700 -I -C -M -t 100x100 \
    data/elevation/sx*.asc \
    data/elevation/ss*.asc \
    data/elevation/st*.asc \
    data/elevation/sy*.asc \
    elevation_data | psql "$DATABASE_URL" -q

echo "Import complete."

echo ""
echo "Step 4: Counting imported tiles..."
TILE_COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM elevation_data;")
echo "Successfully imported $TILE_COUNT tiles into elevation_data table."

echo ""
echo "=== Import Complete ==="
