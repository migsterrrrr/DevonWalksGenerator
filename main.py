import os
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Dict, Any
from contextlib import asynccontextmanager

from app.router import RoutePlanner, to_gpx

router_engine = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global router_engine
    print("Starting Devon Walking Route Planner...")
    router_engine = RoutePlanner()
    print("Route planner initialized!")
    yield
    print("Shutting down...")


app = FastAPI(
    title="Devon Walking Route Planner",
    description="A walking route planner for Devon, UK",
    version="1.0.0",
    lifespan=lifespan
)


class RouteRequest(BaseModel):
    start: List[float]
    end: List[float]


class RouteResponse(BaseModel):
    success: bool
    path: List[List[float]]
    distance_m: float = 0
    elevation_gain: float = 0
    total_time_s: float = 0
    num_nodes: int = 0
    error: str = ""
    breakdown: Dict[str, float] = {}
    segments: List[Dict[str, Any]] = []
    elevation_profile: List[Dict[str, float]] = []


@app.get("/health")
async def health():
    return {"status": "healthy", "graph_loaded": router_engine is not None}


@app.post("/api/route", response_model=RouteResponse)
async def calculate_route(request: RouteRequest):
    if router_engine is None:
        raise HTTPException(status_code=503, detail="Route planner not initialized")
    
    if len(request.start) != 2 or len(request.end) != 2:
        raise HTTPException(status_code=400, detail="Start and end must be [lat, lon] arrays")
    
    start_lat, start_lon = request.start
    end_lat, end_lon = request.end
    
    result = router_engine.find_route(start_lat, start_lon, end_lat, end_lon)
    
    return RouteResponse(
        success=result.get("success", False),
        path=result.get("path", []),
        distance_m=result.get("distance_m", 0),
        elevation_gain=result.get("elevation_gain", 0),
        total_time_s=result.get("total_time_s", 0),
        num_nodes=result.get("num_nodes", 0),
        error=result.get("error", ""),
        breakdown=result.get("breakdown", {}),
        segments=result.get("segments", []),
        elevation_profile=result.get("elevation_profile", [])
    )


@app.post("/download_gpx")
async def download_gpx(request: RouteRequest):
    if router_engine is None:
        raise HTTPException(status_code=503, detail="Route planner not initialized")
    
    if len(request.start) != 2 or len(request.end) != 2:
        raise HTTPException(status_code=400, detail="Start and end must be [lat, lon] arrays")
    
    start_lat, start_lon = request.start
    end_lat, end_lon = request.end
    
    result = router_engine.find_route(start_lat, start_lon, end_lat, end_lon)
    
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Route calculation failed"))
    
    gpx_content = to_gpx(result)
    if not gpx_content:
        raise HTTPException(status_code=500, detail="Failed to generate GPX")
    
    return Response(
        content=gpx_content,
        media_type="application/gpx+xml",
        headers={"Content-Disposition": "attachment; filename=route.gpx"}
    )


app.mount("/", StaticFiles(directory="static", html=True), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)