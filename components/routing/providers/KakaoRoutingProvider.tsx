// routing/providers/KakaoRoutingProvider.tsx

import { RouteOptions, Route, RouteStep } from '../../../types';
import { MapProvider } from '../../map-providers/BaseMapProvider';
import { RoutingProvider, RouteDisplay } from '../BaseRoutingProvider';

export class KakaoRoutingProvider implements RoutingProvider {
  private routeDisplays: Map<string, RouteDisplay> = new Map();
  
  getName(): string {
    return 'kakao';
  }
  
  getSupportedTravelModes(): string[] {
    return ['driving', 'walking'];
  }
  
  getMaxWaypoints(): number {
    return 5; // 카카오맵은 최대 5개 경유지 지원
  }
  
  async calculateRoute(options: RouteOptions): Promise<Route[]> {
    const waypoints = options.waypoints;
    if (waypoints.length < 2) {
      throw new Error('At least origin and destination required');
    }
    
    const origin = waypoints[0];
    const destination = waypoints[waypoints.length - 1];
    const intermediateWaypoints = waypoints.slice(1, -1);
    
    // Vercel API Route를 통한 Kakao Mobility Directions REST API 호출
    const apiUrl = '/api/kakao-route';
    
    const requestBody = {
      origin: {
        lat: origin.position.lat,
        lng: origin.position.lng
      },
      destination: {
        lat: destination.position.lat,
        lng: destination.position.lng
      },
      waypoints: intermediateWaypoints.length > 0 
        ? intermediateWaypoints.map(wp => ({
            lat: wp.position.lat,
            lng: wp.position.lng
          }))
        : undefined,
      summary: options.travelMode === 'walking' ? 'walking' : 'driving'
    };
    
    try {
      console.log('[KakaoRoutingProvider] Calling Kakao Directions API via proxy:', requestBody);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(`Kakao Directions API error: ${response.status} - ${errorData.error || 'Unknown error'}`);
      }
      
      const data = await response.json();
      
      if (!data.routes || data.routes.length === 0) {
        throw new Error('No routes found');
      }
      
      console.log('[KakaoRoutingProvider] Received routes:', data.routes.length);
      
      const routes: Route[] = data.routes.map((route: any, index: number) => {
        const summary = route.summary || {};
        const sections = route.sections || [];
        
        // 모든 섹션의 도로 정보를 합쳐서 steps 생성
        const steps: RouteStep[] = [];
        let polyline: Array<{ lat: number; lng: number }> = [];
        
        sections.forEach((section: any) => {
          if (section.roads) {
            section.roads.forEach((road: any) => {
              steps.push({
                instruction: road.name || '',
                distance: road.distance || 0,
                duration: 0,
                polyline: []
              });
              
              // vertexes에서 polyline 생성 (카카오 API는 [lng, lat, lng, lat, ...] 형식)
              if (road.vertexes && Array.isArray(road.vertexes)) {
                for (let i = 0; i < road.vertexes.length; i += 2) {
                  if (i + 1 < road.vertexes.length) {
                    polyline.push({
                      lat: road.vertexes[i + 1], // y 좌표 (위도)
                      lng: road.vertexes[i]      // x 좌표 (경도)
                    });
                  }
                }
              }
            });
          }
        });
        
        return {
          id: `route-${Date.now()}-${index}`,
          distance: summary.distance || 0,
          duration: summary.duration || 0,
          polyline: polyline,
          steps
        };
      });
      
      console.log('[KakaoRoutingProvider] Parsed routes:', routes.length);
      return routes;
    } catch (error) {
      console.error('[KakaoRoutingProvider] Route calculation failed:', error);
      throw error;
    }
  }
  
  displayRoute(route: Route, mapProvider: MapProvider): RouteDisplay {
    const mapInstance = mapProvider.getMapInstance();
    if (!mapInstance) {
      throw new Error('Map instance not available');
    }
    
    const path = route.polyline.map(p => new window.kakao.maps.LatLng(p.lat, p.lng));
    
    const polyline = new window.kakao.maps.Polyline({
      path: path,
      strokeWeight: 5,
      strokeColor: '#4285F4',
      strokeOpacity: 1.0,
      strokeStyle: 'solid',
      map: mapInstance,
      zIndex: 1000
    });
    
    const display: RouteDisplay = {
      id: route.id,
      route,
      remove: () => {
        polyline.setMap(null);
        this.routeDisplays.delete(route.id);
      },
      highlight: () => {
        polyline.setOptions({
          strokeColor: '#EA4335',
          strokeWeight: 7
        });
      },
      unhighlight: () => {
        polyline.setOptions({
          strokeColor: '#4285F4',
          strokeWeight: 5
        });
      }
    };
    
    this.routeDisplays.set(route.id, display);
    return display;
  }
  
  removeRoute(routeDisplay: RouteDisplay): void {
    routeDisplay.remove();
  }
  
  private decodePolyline(roads: any[]): Array<{ lat: number; lng: number }> {
    const polyline: Array<{ lat: number; lng: number }> = [];
    
    roads.forEach(road => {
      if (road.vertexes) {
        for (let i = 0; i < road.vertexes.length; i += 2) {
          polyline.push({
            lat: road.vertexes[i + 1],
            lng: road.vertexes[i]
          });
        }
      }
    });
    
    return polyline;
  }
}
