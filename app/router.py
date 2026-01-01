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

def calculate_accurate_gain(elevations):
    """
    Calculate elevation gain using a State Machine approach.
    It tracks 'seeking_peak' vs 'seeking_valley' states to capture 
    major climbs while ignoring noise (Threshold = 5m).
    """
    if not elevations: 
        return 0.0
    
    smoothed = []
    if len(elevations) < 3:
        smoothed = elevations
    else:
        smoothed = [elevations[0]]
        for i in range(1, len(elevations) - 1):
            avg = (elevations[i-1] + elevations[i] + elevations[i+1]) / 3.0
            smoothed.append(avg)
        smoothed.append(elevations[-1])
    
    THRESHOLD = 5.0
    total_gain = 0.0
    valley = smoothed[0]
    peak = smoothed[0]
    state = 'seeking_peak'
    
    for h in smoothed:
        if state == 'seeking_peak':
            if h > peak:
                peak = h
            if h < peak - THRESHOLD:
                total_gain += (peak - valley)
                valley = h
                state = 'seeking_valley'
        elif state == 'seeking_valley':
            if h < valley:
                valley = h
            if h > valley + THRESHOLD:
                peak = h
                state = 'seeking_peak'
    
    if state == 'seeking_peak':
        total_gain += (peak - valley)
    
    return round(total_gain, 1)


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
            total_time_s = 0
            road_stats = {}
            segments = []
            current_segment = None
            elevation_profile = []
            raw_elevations = []
            cumulative_dist = 0
            
            total_weighted_score = 0
            crossings_count = 0
            prev_score = None
            
            SURFACE_SCORES = {
                'footway': 100, 'path': 100, 'bridleway': 100, 'track': 100,
                'cycleway': 90,
                'unclassified': 50, 'tertiary': 50, 'tertiary_link': 50,
                'residential': 30, 'living_street': 30, 'service': 30,
                'primary': 0, 'primary_link': 0, 'secondary': 0, 'secondary_link': 0, 
                'trunk': 0, 'trunk_link': 0,
                'unknown': 50
            }
            
            for i, node in enumerate(path_nodes):
                data = self.graph.nodes[node]
                lat, lon = mercator_to_lat_lon(data['x'], data['y'])
                coord = [lat, lon]
                path_coords.append(coord)
                
                ele_curr = data.get('elevation', 0)
                raw_elevations.append(ele_curr)
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
                    
                    raw_type = edge.get('highway', 'unknown')
                    if isinstance(raw_type, list):
                        road_type = raw_type[0]
                    else:
                        road_type = str(raw_type)
                    road_stats[road_type] = road_stats.get(road_type, 0) + length
                    
                    if current_segment is None or current_segment['type'] != road_type:
                        if current_segment is not None:
                            current_segment['coords'].append(coord)
                        current_segment = {'coords': [path_coords[i-1], coord], 'type': road_type}
                        segments.append(current_segment)
                    else:
                        current_segment['coords'].append(coord)
                    
                    base_score = SURFACE_SCORES.get(road_type, 50)
                    
                    ele_prev = self.graph.nodes[prev].get('elevation', 0)
                    ele_change = abs(ele_curr - ele_prev)
                    grade = ele_change / length if length > 0 else 0
                    gradient_factor = 0.7 if grade >= 0.08 else 1.0
                    
                    if prev_score is not None:
                        if prev_score >= 90 and base_score <= 30:
                            crossings_count += 1
                    
                    segment_score = base_score * gradient_factor
                    total_weighted_score += segment_score * length
                    prev_score = base_score
            
            total_gain = calculate_accurate_gain(raw_elevations)
            
            if total_dist > 0:
                raw_average = total_weighted_score / total_dist
                trail_score = raw_average - (crossings_count * 5)
                trail_score = max(0, min(100, trail_score))
            else:
                trail_score = 0

            return {
                "success": True, 
                "path": path_coords, 
                "distance_m": round(total_dist, 1),
                "elevation_gain": round(total_gain, 1),
                "total_time_s": round(total_time_s, 1),
                "num_nodes": len(path_nodes),
                "breakdown": road_stats,
                "segments": segments,
                "elevation_profile": elevation_profile,
                "trail_score": round(trail_score, 1),
                "crossings_count": crossings_count
            }
        except nx.NetworkXNoPath:
            return {"success": False, "error": "No path found"}
