import os
from sqlalchemy import create_engine, text

# We use the existing database connection
DATABASE_URL = os.environ.get("DATABASE_URL")

# Three distinct test points in Devon
TEST_POINTS = [
    ("Exmouth Beach (Sea Level)", 50.6146, -3.4147),
    ("Exeter Cathedral (City)", 50.7225, -3.5297),
    ("High Willhays (Dartmoor Peak)", 50.6211, -4.0044)
]

print("--- 🏔️ ELEVATION DATA VERIFICATION ---")

try:
    engine = create_engine(DATABASE_URL)
    with engine.connect() as conn:
        for name, lat, lon in TEST_POINTS:
            # Query logic:
            # 1. Create a point from Lat/Lon (SRID 4326)
            # 2. Transform it to British National Grid (SRID 27700) to match the raster
            # 3. Find the raster tile that intersects this point
            # 4. Extract the value (height) at that exact pixel
            query = text("""
                SELECT ST_Value(rast, ST_Transform(ST_SetSRID(ST_MakePoint(:lon, :lat), 4326), 27700))
                FROM elevation_data
                WHERE ST_Intersects(rast, ST_Transform(ST_SetSRID(ST_MakePoint(:lon, :lat), 4326), 27700))
            """)
            
            result = conn.execute(query, {"lat": lat, "lon": lon}).fetchone()
            
            if result and result[0] is not None:
                height = result[0]
                print(f"✅ {name}: {height:.2f} meters")
            else:
                print(f"❌ {name}: NO DATA (Is this coordinate inside the imported tiles?)")

except Exception as e:
    print(f"🔥 Error: {e}")
