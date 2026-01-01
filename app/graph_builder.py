import os
import pickle
import networkx as nx
from sqlalchemy import create_engine, text
from shapely import wkb

GRAPH_FILE = "devon_graph.gpickle"
DATABASE_URL = os.environ.get("DATABASE_URL", "")
BATCH_SIZE = 50000  # Process 50k nodes at a time to prevent memory crashes

# Traffic penalties by road type
ROAD_PENALTIES = {
    # Default/Paths: 1.0x
    'footway': 1.0,
    'path': 1.0,
    'pedestrian': 1.0,
    'track': 1.0,
    'bridleway': 1.0,
    'cycleway': 1.0,
    'steps': 1.0,
    # Residential/Service/Living Street: 1.1x
    'residential': 1.1,
    'service': 1.1,
    'living_street': 1.1,
    # Unclassified/Tertiary: 1.2x
    'unclassified': 1.6,
    'tertiary': 1.6,
    # Secondary (B-Roads): 1.5x
    'secondary': 2.0,
    # Primary/Trunk (A-Roads): 2.0x
    'primary': 2.5,
    'trunk': 2.5,
}

def load_graph():
    # If graph exists, just load it
    if os.path.exists(GRAPH_FILE):
        print(f"Loading cached graph from {GRAPH_FILE}...")
        with open(GRAPH_FILE, "rb") as f:
            return pickle.load(f)

    print("--- 🏗️ BUILDING SMART GRAPH FROM DATABASE ---")
    engine = create_engine(DATABASE_URL)
    G = nx.Graph()
    
    # Step A: Fetch The Road Network (expanded to all valid highway types)
    print("Step 1/4: Fetching road network...")
    query = text("""
        SELECT osm_id, highway, ST_AsEWKB(way) as geom, 
               ST_Length(ST_Transform(way, 4326)::geography) as length_m
        FROM planet_osm_line
        WHERE highway IN ('footway', 'path', 'pedestrian', 'track', 'bridleway', 
                          'residential', 'service', 'unclassified', 'tertiary',
                          'primary', 'secondary', 'trunk', 'living_street', 
                          'cycleway', 'steps')
    """)
    
    with engine.connect() as conn:
        rows = conn.execute(query).fetchall()
    
    print(f"   Processing {len(rows)} edges...")
    
    node_id = 0
    coord_map = {} # (x,y) -> node_id
    
    for row in rows:
        try:
            geom = wkb.loads(bytes(row.geom))
            coords = list(geom.coords)
            highway_type = row.highway
            penalty = ROAD_PENALTIES.get(highway_type, 1.0)
            
            for i in range(len(coords) - 1):
                u_c = (round(coords[i][0], 6), round(coords[i][1], 6))
                v_c = (round(coords[i+1][0], 6), round(coords[i+1][1], 6))
                
                if u_c not in coord_map:
                    coord_map[u_c] = node_id; G.add_node(node_id, x=u_c[0], y=u_c[1], elevation=0); node_id += 1
                if v_c not in coord_map:
                    coord_map[v_c] = node_id; G.add_node(node_id, x=v_c[0], y=v_c[1], elevation=0); node_id += 1
                
                # Add edge with 'length' and 'base_cost' (length * penalty)
                dist = row.length_m / (len(coords) - 1)
                base_cost = dist * penalty
                G.add_edge(coord_map[u_c], coord_map[v_c], length=dist, base_cost=base_cost, highway=highway_type)
        except: continue

    # Step B: Clean Islands - Keep only the largest connected component
    print(f"Step 2/4: Cleaning disconnected islands...")
    if G.number_of_nodes() > 0:
        components = list(nx.connected_components(G))
        if len(components) > 1:
            largest_component = max(components, key=len)
            nodes_to_remove = set(G.nodes()) - largest_component
            G.remove_nodes_from(nodes_to_remove)
            print(f"   Removed {len(nodes_to_remove)} nodes from {len(components) - 1} smaller islands")
            print(f"   Kept largest component with {len(largest_component)} nodes")
        else:
            print(f"   Graph is already fully connected ({G.number_of_nodes()} nodes)")

    # Step C: Fetch Elevations in Chunks (The Fix for Memory Issues)
    print(f"Step 3/4: Fetching elevations for {G.number_of_nodes()} nodes...")
    all_nodes = list(G.nodes(data=True))
    
    for i in range(0, len(all_nodes), BATCH_SIZE):
        batch = all_nodes[i : i + BATCH_SIZE]
        
        # Coords are in SRID 3857 (Web Mercator), transform to 27700 (British National Grid)
        values = ",".join(f"({n}, ST_Transform(ST_SetSRID(ST_MakePoint({d['x']},{d['y']}), 3857), 27700))" for n, d in batch)
        
        sql = text(f"""
            WITH b(id, g) AS (VALUES {values})
            SELECT b.id, COALESCE(ST_Value(e.rast, b.g), 0) 
            FROM b LEFT JOIN elevation_data e ON ST_Intersects(e.rast, b.g)
        """)
        
        with engine.connect() as conn:
            for nid, h in conn.execute(sql):
                G.nodes[nid]['elevation'] = h
        
        print(f"   Processed {min(i + BATCH_SIZE, len(all_nodes))} nodes...")

    # Step D: Calculate Naismith Weights using penalized base_cost
    print("Step 4/4: Applying Naismith's Rule (Hills = Harder)...")
    for u, v, d in G.edges(data=True):
        base_cost = d.get('base_cost', d.get('length', 0))
        gain = max(0, G.nodes[v]['elevation'] - G.nodes[u]['elevation'])
        # Naismith: Time (s) = (base_cost / 1.38) + (Ascent * 6.0)
        time_s = (base_cost / 1.38) + (gain * 6.0)
        G[u][v]['weight'] = time_s  # The router will use THIS to find the path

    print(f"Saving Smart Graph to {GRAPH_FILE}...")
    with open(GRAPH_FILE, "wb") as f: pickle.dump(G, f)
    return G
