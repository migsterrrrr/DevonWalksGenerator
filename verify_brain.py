import pickle
import random
import networkx as nx

print("--- 🧠 INSPECTING GRAPH BRAIN ---")
try:
    with open("devon_graph.gpickle", "rb") as f:
        G = pickle.load(f)
    
    print(f"✅ Graph Loaded. Nodes: {G.number_of_nodes()}")
    
    # 1. Check Elevation on Nodes
    node = list(G.nodes())[0]
    if 'elevation' in G.nodes[node]:
        ele = G.nodes[node]['elevation']
        print(f"✅ Nodes have Elevation Data! (Sample Node {node}: {ele:.2f}m)")
    else:
        print(f"❌ Nodes are MISSING elevation.")

    # 2. Check Naismith Weight on Edges
    # We look for an edge where weight != length (meaning hills affected the time)
    found_smart_edge = False
    for u, v, data in list(G.edges(data=True))[:1000]:
        length = data.get('length', 0)
        weight = data.get('weight', 0) # This is 'time_s' in the smart graph
        
        # If weight is vastly different from length, Naismith is working
        # (A flat 100m path has weight ~72s. If weight == 100, it's the old graph)
        if abs(weight - length) > 1:
            print(f"✅ Found Smart Edge! ({u}->{v})")
            print(f"   Length: {length:.1f}m")
            print(f"   Cost (Time): {weight:.1f}s")
            print(f"   (The router sees this as '{weight:.1f}' units of effort)")
            found_smart_edge = True
            break
            
    if not found_smart_edge:
        print("❌ Graph seems to use Distance as Weight. Naismith is NOT active.")

except Exception as e:
    print(f"❌ Error reading graph: {e}")
