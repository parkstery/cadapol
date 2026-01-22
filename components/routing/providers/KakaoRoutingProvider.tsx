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
    if (!window.kakao || !window.kakao.maps) {
      throw new Error('Kakao Maps SDK not loaded');
    }
    
    const waypoints = options.waypoints;
    if (waypoints.length < 2) {
      throw new Error('At least origin and destination required');
    }
    
    const origin = waypoints[0];
    const destination = waypoints[waypoints.length - 1];
    const intermediateWaypoints = waypoints.slice(1, -1);
    
    // 카카오 REST API를 사용한 경로 찾기
    const KAKAO_REST_API_KEY = '8d2d116d6a534a98e73133808f5843a6';
    const baseUrl = 'https://apis-navi.kakao.com/v1/directions';
    
    // 경유지가 있으면 waypoints 파라미터 추가
    let waypointsParam = '';
    if (intermediateWaypoints.length > 0) {
      const waypointsStr = intermediateWaypoints
        .map(wp => `${wp.position.lng},${wp.position.lat}`)
        .join('|');
      waypointsParam = `&waypoints=${encodeURIComponent(waypointsStr)}`;
    }
    
    // 이동 수단에 따른 옵션
    const summary = options.travelMode === 'walking' ? '&summary=walking' : '&summary=driving';
    
    const url = `${baseUrl}?origin=${origin.position.lng},${origin.position.lat}&destination=${destination.position.lng},${destination.position.lat}${waypointsParam}${summary}`;
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `KakaoAK ${KAKAO_REST_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Kakao Directions API error: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      
      if (!data.routes || data.routes.length === 0) {
        throw new Error('No routes found');
      }
      
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
              
              // vertexes에서 polyline 생성
              if (road.vertexes) {
                for (let i = 0; i < road.vertexes.length; i += 2) {
                  polyline.push({
                    lat: road.vertexes[i + 1],
                    lng: road.vertexes[i]
                  });
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
