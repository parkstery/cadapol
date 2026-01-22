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
    console.log('[RoutingManager] setMapProvider called', {
      provider: provider?.getName() || 'null',
      providerInstance: provider
    });
    
    if (!provider) {
      console.warn('[RoutingManager] Setting provider to null, clearing routes');
      this.mapProvider = null;
      this.routingProvider = null;
      this.clearRoutes();
      return;
    }
    
    this.mapProvider = provider;
    
    // 기존 경로 제거
    this.clearRoutes();
    
    // 맵 제공자에 맞는 RoutingProvider 생성
    const providerName = provider.getName();
    console.log('[RoutingManager] Creating routing provider for:', providerName);
    
    if (providerName === 'google') {
      this.routingProvider = new GoogleRoutingProvider();
    } else if (providerName === 'kakao') {
      this.routingProvider = new KakaoRoutingProvider();
    } else if (providerName === 'Naver') {
      // 네이버 맵은 카카오 RoutingProvider 사용 (네이버는 직접 길찾기 API가 제한적)
      this.routingProvider = new KakaoRoutingProvider();
    } else {
      console.error('[RoutingManager] Unsupported provider name:', providerName);
      this.routingProvider = null;
      throw new Error(`지원되지 않는 맵 제공자입니다: ${providerName}`);
    }
    
    console.log('[RoutingManager] Routing provider created successfully:', {
      hasRoutingProvider: !!this.routingProvider,
      providerName
    });
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
    console.log('[RoutingManager] calculateRouteFromPlaces called', {
      hasRoutingProvider: !!this.routingProvider,
      hasMapProvider: !!this.mapProvider,
      mapProviderName: this.mapProvider?.getName()
    });
    
    if (!this.routingProvider || !this.mapProvider) {
      console.error('[RoutingManager] Missing provider:', {
        routingProvider: this.routingProvider,
        mapProvider: this.mapProvider
      });
      throw new Error('Routing provider or map provider not set');
    }
    
    // 지명을 좌표로 변환
    const providerName = this.mapProvider.getName();
    // 네이버 맵일 때는 카카오 geocode 사용 (네이버는 직접 geocode가 제한적)
    const geocodeProvider = providerName === 'Naver' ? 'kakao' : (providerName.toLowerCase() as 'google' | 'kakao' | 'naver');
    
    console.log('[Routing] Geocoding origin:', origin, 'with provider:', geocodeProvider);
    const originResult = await geocode(origin, geocodeProvider);
    console.log('[Routing] Origin geocode result:', originResult);
    
    console.log('[Routing] Geocoding destination:', destination, 'with provider:', geocodeProvider);
    const destinationResult = await geocode(destination, geocodeProvider);
    console.log('[Routing] Destination geocode result:', destinationResult);
    
    if (!originResult) {
      throw new Error(`출발지 "${origin}"를 찾을 수 없습니다. 주소나 지명을 확인해주세요.`);
    }
    
    if (!destinationResult) {
      throw new Error(`목적지 "${destination}"를 찾을 수 없습니다. 주소나 지명을 확인해주세요.`);
    }
    
    // 경유지 좌표 변환
    const waypointResults: Waypoint[] = [];
    for (let i = 0; i < waypoints.length; i++) {
      if (waypoints[i].trim()) {
        console.log('[Routing] Geocoding waypoint:', waypoints[i], 'with provider:', geocodeProvider);
        const waypointResult = await geocode(waypoints[i], geocodeProvider);
        console.log('[Routing] Waypoint geocode result:', waypointResult);
        if (waypointResult) {
          waypointResults.push({
            id: `waypoint-${i}`,
            position: { lat: waypointResult.lat, lng: waypointResult.lng },
            label: waypoints[i],
            order: i + 1
          });
        } else {
          console.warn(`[Routing] 경유지 "${waypoints[i]}"를 찾을 수 없습니다. 경유지가 제외됩니다.`);
        }
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
    console.log('[Routing] Calculating route with options:', {
      origin: routeOptions.waypoints[0],
      destination: routeOptions.waypoints[routeOptions.waypoints.length - 1],
      waypoints: routeOptions.waypoints.slice(1, -1),
      travelMode: routeOptions.travelMode
    });
    
    try {
      const routes = await this.routingProvider.calculateRoute(routeOptions);
      console.log('[Routing] Route calculation successful:', routes.length, 'routes found');
      return routes;
    } catch (error) {
      console.error('[Routing] Route calculation failed:', error);
      throw error;
    }
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
