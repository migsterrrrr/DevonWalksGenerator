import sys
import os
import time

# Ensure we can import from the app folder
sys.path.append(os.getcwd())

print("--- 🔍 PHASE 3 VERIFICATION: ROUTING ENGINE ---")

try:
    print("Step 1: Importing RoutePlanner...")
    from app.router import RoutePlanner
    print("   ✅ Import Successful.")
except ImportError as e:
    print(f"   ❌ FATAL: Could not import app.router. Check folder structure. Error: {e}")
    sys.exit(1)

try:
    print("Step 2: Initializing Graph (This queries the DB or loads cache)...")
    start_time = time.time()
    router = RoutePlanner()
    duration = time.time() - start_time
    
    # Check if graph exists on the object (NetworkX graph)
    if hasattr(router, 'graph'):
        node_count = len(router.graph.nodes)
        edge_count = len(router.graph.edges)
        print(f"   ✅ Graph Loaded in {duration:.2f}s.")
        print(f"      Nodes: {node_count}")
        print(f"      Edges: {edge_count}")
        
        if node_count < 100:
             print("   ⚠️ WARNING: Graph seems too small. Did the DB import work?")
    else:
        print("   ⚠️ WARNING: 'graph' attribute not found on Router object.")

except Exception as e:
    print(f"   ❌ FATAL: Graph initialization failed. Error: {e}")
    sys.exit(1)

try:
    print("Step 3: Calculating Test Route (Exeter Cathedral -> St Davids)...")
    # Coordinates for Exeter, Devon
    start_lat, start_lon = 50.7236, -3.5297
    end_lat, end_lon = 50.7290, -3.5430
    
    route = router.find_route(start_lat, start_lon, end_lat, end_lon)
    
    if route:
        print(f"   ✅ Route Found!")
        print(f"      Output Type: {type(route)}")
        print(f"      Data Snippet: {str(route)[:100]}...")
    else:
        print("   ❌ Route returned Empty/None.")

except Exception as e:
    print(f"   ❌ FATAL: Routing calculation crashed. Error: {e}")
    sys.exit(1)

print("--- 🏁 VERIFICATION COMPLETE ---")
