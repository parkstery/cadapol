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
    if (!window.kakao || !window.kakao.maps || !window.kakao.maps.services) {
      throw new Error('Kakao Maps SDK not loaded');
    }
    
    return new Promise((resolve, reject) => {
      const waypoints = options.waypoints;
      if (waypoints.length < 2) {
        reject(new Error('At least origin and destination required'));
        return;
      }
      
      const origin = waypoints[0];
      const destination = waypoints[waypoints.length - 1];
      const intermediateWaypoints = waypoints.slice(1, -1);
      
      const directions = new window.kakao.maps.services.Directions();
      
      const request = {
        origin: new window.kakao.maps.LatLng(origin.position.lat, origin.position.lng),
        destination: new window.kakao.maps.LatLng(destination.position.lat, destination.position.lng),
        waypoints: intermediateWaypoints.map(wp => ({
          lat: wp.position.lat,
          lng: wp.position.lng
        })),
        priority: options.travelMode === 'walking' ? window.kakao.maps.services.RoutePriority.WALKING : window.kakao.maps.services.RoutePriority.SHORTEST
      };
      
      directions.route(request, (result: any, status: any) => {
        if (status === window.kakao.maps.services.Status.OK) {
          const routes: Route[] = result.routes.map((route: any, index: number) => {
            const summary = route.summary;
            const steps: RouteStep[] = route.sections[0]?.roads?.map((road: any) => ({
              instruction: road.name || '',
              distance: road.distance || 0,
              duration: 0, // 카카오맵은 duration을 제공하지 않음
              polyline: []
            })) || [];
            
            return {
              id: `route-${Date.now()}-${index}`,
              distance: summary.totalDistance || 0,
              duration: summary.totalTime || 0,
              polyline: this.decodePolyline(route.sections[0]?.roads || []),
              steps
            };
          });
          resolve(routes);
        } else {
          reject(new Error(`Directions request failed: ${status}`));
        }
      });
    });
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
