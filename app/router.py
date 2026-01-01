import math
import networkx as nx
from scipy.spatial import cKDTree
from app.graph_builder import load_graph


def to_gpx(route_data):
    """Convert route data to GPX XML format."""
    if not route_data.get("success") or not route_data.get("segments"):
        return None
    
    coords_with_elevation = []
    for segment in route_data["segments"]:
        for coord in segment["coords"]:
            coords_with_elevation.append(coord)
    
    seen = set()
    unique_coords = []
    for coord in coords_with_elevation:
        key = (coord[0], coord[1])
        if key not in seen:
            seen.add(key)
            unique_coords.append(coord)
    
    elevation_map = {}
    if route_data.get("elevation_profile"):
        path = route_data.get("path", [])
        profile = route_data["elevation_profile"]
        for i, pt in enumerate(path):
            if i < len(profile):
                elevation_map[(round(pt[0], 6), round(pt[1], 6))] = profile[i]["elevation_m"]
    
    gpx_lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<gpx version="1.1" creator="DevonWalker" xmlns="http://www.topografix.com/GPX/1/1">',
        '  <trk>',
        '    <name>Devon Walking Route</name>',
        '    <trkseg>'
    ]
    
    for coord in unique_coords:
        lat, lon = coord[0], coord[1]
        ele = elevation_map.get((round(lat, 6), round(lon, 6)), 0)
        gpx_lines.append(f'      <trkpt lat="{lat}" lon="{lon}">')
        gpx_lines.append(f'        <ele>{ele}</ele>')
        gpx_lines.append('      </trkpt>')
    
    gpx_lines.extend([
        '    </trkseg>',
        '  </trk>',
        '</gpx>'
    ])
    
    return '\n'.join(gpx_lines)

def lat_lon_to_mercator(lat, lon):
    x = lon * 20037508.34 / 180.0
    y = math.log(math.tan((90 + lat) * math.pi / 360.0)) / (math.pi / 180.0)
    y = y * 20037508.34 / 180.0
    return x, y

def mercator_to_lat_lon(x, y):
    lon = x * 180.0 / 20037508.34
    lat = math.atan(math.exp(y * math.pi / 20037508.34)) * 360.0 / math.pi - 90
    return lat, lon

class RoutePlanner:
    def __init__(self):
        print("Initializing RoutePlanner...")
        self.graph = load_graph()
        self._build_spatial_index()
        print(f"RoutePlanner ready with {self.graph.number_of_nodes()} nodes")
    
    def _build_spatial_index(self):
        # Use KDTree for O(log N) lookup instead of O(N) loop
        self.node_ids = list(self.graph.nodes())
        coords = [[self.graph.nodes[n]['x'], self.graph.nodes[n]['y']] for n in self.node_ids]
        self.tree = cKDTree(coords)
    
    def _find_nearest_node(self, lon, lat):
        tx, ty = lat_lon_to_mercator(lat, lon)
        dist, idx = self.tree.query([tx, ty], k=1)
        # Check if the snap distance is reasonable (e.g., < 2km)
        if dist > 2000: return None, dist
        return self.node_ids[idx], dist
    
    def find_route(self, start_lat, start_lon, end_lat, end_lon):
        start_node, s_dist = self._find_nearest_node(start_lon, start_lat)
        end_node, e_dist = self._find_nearest_node(end_lon, end_lat)
        
        if start_node is None or end_node is None:
            return {"success": False, "error": "Points too far from road network"}
        
        try:
            path_nodes = nx.dijkstra_path(self.graph, start_node, end_node, weight="weight")
            
            path_coords = []
            total_dist = 0
            total_gain = 0
            total_time_s = 0
            road_stats = {}
            segments = []
            current_segment = None
            elevation_profile = []
            cumulative_dist = 0
            
            for i, node in enumerate(path_nodes):
                data = self.graph.nodes[node]
                lat, lon = mercator_to_lat_lon(data['x'], data['y'])
                coord = [lat, lon]
                path_coords.append(coord)
                
                ele_curr = data.get('elevation', 0)
                elevation_profile.append({
                    'distance_km': round(cumulative_dist / 1000, 3),
                    'elevation_m': round(ele_curr, 1)
                })
                
                if i > 0:
                    prev = path_nodes[i-1]
                    edge = self.graph[prev][node]
                    length = edge.get('length', 0)
                    cumulative_dist += length
                    total_dist += length
                    total_time_s += edge.get('weight', 0)
                    
                    road_type = edge.get('highway', 'unknown')
                    road_stats[road_type] = road_stats.get(road_type, 0) + length
                    
                    if current_segment is None or current_segment['type'] != road_type:
                        if current_segment is not None:
                            current_segment['coords'].append(coord)
                        current_segment = {'coords': [path_coords[i-1], coord], 'type': road_type}
                        segments.append(current_segment)
                    else:
                        current_segment['coords'].append(coord)
                    
                    ele_prev = self.graph.nodes[prev].get('elevation', 0)
                    if ele_curr > ele_prev:
                        total_gain += (ele_curr - ele_prev)

            return {
                "success": True, 
                "path": path_coords, 
                "distance_m": round(total_dist, 1),
                "elevation_gain": round(total_gain, 1),
                "total_time_s": round(total_time_s, 1),
                "num_nodes": len(path_nodes),
                "breakdown": road_stats,
                "segments": segments,
                "elevation_profile": elevation_profile
            }
        except nx.NetworkXNoPath:
            return {"success": False, "error": "No path found"}
