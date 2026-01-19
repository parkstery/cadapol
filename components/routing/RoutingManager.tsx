// routing/RoutingManager.tsx

import { RouteOptions, Route, Waypoint } from '../../types';
import { MapProvider } from '../map-providers/BaseMapProvider';
import { RoutingProvider, RouteDisplay } from './BaseRoutingProvider';
import { GoogleRoutingProvider } from './providers/GoogleRoutingProvider';
import { KakaoRoutingProvider } from './providers/KakaoRoutingProvider';
import { geocode } from '../utils/geocoding';

export class RoutingManager {
  private routingProvider: RoutingProvider | null = null;
  private mapProvider: MapProvider | null = null;
  private currentRouteDisplays: RouteDisplay[] = [];
  
  setMapProvider(provider: MapProvider | null): void {
    this.mapProvider = provider;
    
    // 기존 경로 제거
    this.clearRoutes();
    
    // 맵 제공자에 맞는 RoutingProvider 생성
    if (provider) {
      const providerName = provider.getName();
      if (providerName === 'google') {
        this.routingProvider = new GoogleRoutingProvider();
      } else if (providerName === 'kakao') {
        this.routingProvider = new KakaoRoutingProvider();
      } else {
        this.routingProvider = null;
      }
    } else {
      this.routingProvider = null;
    }
  }
  
  /**
   * 지명 검색 기반 경로 계산
   */
  async calculateRouteFromPlaces(
    origin: string,
    destination: string,
    waypoints: string[] = [],
    travelMode: 'driving' | 'walking' | 'transit' | 'bicycling' = 'driving'
  ): Promise<Route[]> {
    if (!this.routingProvider || !this.mapProvider) {
      throw new Error('Routing provider or map provider not set');
    }
    
    // 지명을 좌표로 변환
    const providerName = this.mapProvider.getName();
    const originResult = await geocode(origin, providerName as 'google' | 'kakao' | 'naver');
    const destinationResult = await geocode(destination, providerName as 'google' | 'kakao' | 'naver');
    
    if (!originResult || !destinationResult) {
      throw new Error('Failed to geocode origin or destination');
    }
    
    // 경유지 좌표 변환
    const waypointResults: Waypoint[] = [];
    for (let i = 0; i < waypoints.length; i++) {
      const waypointResult = await geocode(waypoints[i], providerName as 'google' | 'kakao' | 'naver');
      if (waypointResult) {
        waypointResults.push({
          id: `waypoint-${i}`,
          position: { lat: waypointResult.lat, lng: waypointResult.lng },
          label: waypoints[i],
          order: i + 1
        });
      }
    }
    
    // 경로 옵션 생성
    const routeOptions: RouteOptions = {
      waypoints: [
        {
          id: 'origin',
          position: { lat: originResult.lat, lng: originResult.lng },
          label: origin,
          order: 0
        },
        ...waypointResults,
        {
          id: 'destination',
          position: { lat: destinationResult.lat, lng: destinationResult.lng },
          label: destination,
          order: waypointResults.length + 1
        }
      ],
      travelMode
    };
    
    // 경로 계산
    const routes = await this.routingProvider.calculateRoute(routeOptions);
    
    return routes;
  }
  
  /**
   * 경로 표시
   */
  displayRoutes(routes: Route[]): void {
    if (!this.routingProvider || !this.mapProvider) {
      return;
    }
    
    // 기존 경로 제거
    this.clearRoutes();
    
    // 새 경로 표시
    routes.forEach(route => {
      const display = this.routingProvider!.displayRoute(route, this.mapProvider!);
      this.currentRouteDisplays.push(display);
    });
  }
  
  /**
   * 모든 경로 제거
   */
  clearRoutes(): void {
    if (this.routingProvider) {
      this.currentRouteDisplays.forEach(display => {
        this.routingProvider!.removeRoute(display);
      });
    }
    this.currentRouteDisplays = [];
  }
  
  /**
   * 경로 하이라이트
   */
  highlightRoute(routeId: string): void {
    const display = this.currentRouteDisplays.find(d => d.id === routeId);
    if (display) {
      display.highlight();
    }
  }
  
  /**
   * 경로 하이라이트 해제
   */
  unhighlightRoute(routeId: string): void {
    this.currentRouteDisplays.forEach(display => {
      display.unhighlight();
    });
  }
  
  cleanup(): void {
    this.clearRoutes();
    this.routingProvider = null;
    this.mapProvider = null;
  }
}
