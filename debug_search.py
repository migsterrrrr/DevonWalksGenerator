import os
from sqlalchemy import create_engine, text

# Coordinates roughly in the middle of your missing path
LAT = 50.2736
LON = -3.7933
RADIUS_METERS = 200

print(f"--- 🔍 Inspecting Database at {LAT}, {LON} ---")

db_url = os.environ.get("DATABASE_URL")
if not db_url:
    print("❌ Error: DATABASE_URL environment variable is not set.")
    exit(1)

try:
    engine = create_engine(db_url)
    
    # Query: Find ANY line within 200m of the point
    # We convert the lat/lon to Web Mercator (3857) to match the database projection
    query = text("""
        SELECT osm_id, highway, name
        FROM planet_osm_line
        WHERE ST_DWithin(
            way, 
            ST_Transform(ST_SetSRID(ST_MakePoint(:lon, :lat), 4326), 3857), 
            :radius
        )
    """)
    
    with engine.connect() as conn:
        result = conn.execute(query, {"lat": LAT, "lon": LON, "radius": RADIUS_METERS})
        rows = result.fetchall()
        
    if not rows:
        print("❌ NO DATA FOUND. The database has no paths here at all.")
        print("   -> Implication: Your map file (.osm.pbf) is likely missing this area.")
    else:
        print(f"✅ Found {len(rows)} features nearby:")
        for row in rows:
            print(f"   - ID: {row.osm_id} | Highway: '{row.highway}' | Name: '{row.name}'")
            
        print("\n🔎 DIAGNOSIS:")
        print("If you see the path above but with a strange 'Highway' type (e.g. 'track', 'forestry'),")
        print("you need to add that type to the allowed list in 'app/graph_builder.py'.")

except Exception as e:
    print(f"❌ Database Error: {e}")
