// routing/providers/KakaoRoutingProvider.ts

import { BaseRoutingProvider, RouteDisplay } from '../BaseRoutingProvider';
import { Waypoint, Route, RouteOptions, MapVendor } from '../../../types';

declare global {
  interface Window {
    kakao: any;
  }
}

/**
 * Kakao Maps 길찾기 제공자
 */
export class KakaoRoutingProvider implements BaseRoutingProvider {
  private mapInstance: any = null;
  private directionsService: any = null;
  private currentDisplay: RouteDisplay | null = null;
  private polylines: any[] = [];
  private markers: any[] = [];

  init(mapInstance: any, config?: any): void {
    if (!window.kakao || !window.kakao.maps || !window.kakao.maps.services) {
      throw new Error('Kakao Maps SDK not loaded');
    }

    this.mapInstance = mapInstance;
    this.directionsService = new window.kakao.maps.services.Directions();
  }

  async findRoute(
    waypoints: Waypoint[],
    options?: Partial<RouteOptions>
  ): Promise<Route | null> {
    if (!this.directionsService || !this.mapInstance) {
      throw new Error('KakaoRoutingProvider not initialized');
    }

    if (waypoints.length < 2) {
      console.warn('KakaoRoutingProvider: At least 2 waypoints required');
      return null;
    }

    // waypoints를 order 순서로 정렬
    const sortedWaypoints = [...waypoints].sort((a, b) => a.order - b.order);
    const origin = sortedWaypoints[0];
    const destination = sortedWaypoints[sortedWaypoints.length - 1];
    const intermediateWaypoints = sortedWaypoints.slice(1, -1);

    return new Promise((resolve, reject) => {
      const request: any = {
        origin: new window.kakao.maps.LatLng(origin.position.lat, origin.position.lng),
        destination: new window.kakao.maps.LatLng(
          destination.position.lat,
          destination.position.lng
        ),
        waypoints:
          intermediateWaypoints.length > 0
            ? intermediateWaypoints.map((wp) => ({
                x: wp.position.lng,
                y: wp.position.lat,
              }))
            : undefined,
        priority: this.mapTravelMode(options?.travelMode || 'driving'),
      };

      this.directionsService.route(request, (result: any, status: any) => {
        if (status === window.kakao.maps.services.Status.OK) {
          const route = this.convertKakaoRouteToRoute(result);
          resolve(route);
        } else {
          console.error('KakaoRoutingProvider: Route calculation failed', status);
          resolve(null);
        }
      });
    });
  }

  displayRoute(route: Route): RouteDisplay | null {
    if (!this.mapInstance) {
      console.warn('KakaoRoutingProvider: Not initialized');
      return null;
    }

    // 기존 경로 제거
    this.clearRoute();

    // 경로를 Polyline으로 표시
    const path = route.polyline.map(
      (point) => new window.kakao.maps.LatLng(point.lat, point.lng)
    );

    const polyline = new window.kakao.maps.Polyline({
      path: path,
      strokeWeight: 5,
      strokeColor: '#4285F4',
      strokeOpacity: 1,
      strokeStyle: 'solid',
    });

    polyline.setMap(this.mapInstance);
    this.polylines.push(polyline);

    // 출발지/목적지 마커 추가
    if (route.polyline.length > 0) {
      const startPoint = route.polyline[0];
      const endPoint = route.polyline[route.polyline.length - 1];

      const startMarker = new window.kakao.maps.Marker({
        position: new window.kakao.maps.LatLng(startPoint.lat, startPoint.lng),
        map: this.mapInstance,
      });

      const endMarker = new window.kakao.maps.Marker({
        position: new window.kakao.maps.LatLng(endPoint.lat, endPoint.lng),
        map: this.mapInstance,
      });

      this.markers.push(startMarker, endMarker);
    }

    const display: RouteDisplay = {
      id: route.id,
      route,
      remove: () => {
        polyline.setMap(null);
        this.markers.forEach((marker) => marker.setMap(null));
        this.polylines = this.polylines.filter((p) => p !== polyline);
        this.markers = [];
      },
      highlight: () => {
        polyline.setOptions({
          strokeWeight: 7,
          strokeColor: '#1a73e8',
        });
      },
      unhighlight: () => {
        polyline.setOptions({
          strokeWeight: 5,
          strokeColor: '#4285F4',
        });
      },
      setVisible: (visible: boolean) => {
        polyline.setVisible(visible);
        this.markers.forEach((marker) => marker.setVisible(visible));
      },
    };

    this.currentDisplay = display;

    // 지도 범위 조정
    const bounds = new window.kakao.maps.LatLngBounds();
    route.polyline.forEach((point) => {
      bounds.extend(new window.kakao.maps.LatLng(point.lat, point.lng));
    });
    this.mapInstance.setBounds(bounds);

    return display;
  }

  clearRoute(display?: RouteDisplay): void {
    if (display) {
      display.remove();
    } else if (this.currentDisplay) {
      this.currentDisplay.remove();
      this.currentDisplay = null;
    }

    // 모든 polyline과 marker 제거
    this.polylines.forEach((polyline) => polyline.setMap(null));
    this.markers.forEach((marker) => marker.setMap(null));
    this.polylines = [];
    this.markers = [];
  }

  clearAllRoutes(): void {
    this.clearRoute();
  }

  cleanup(): void {
    this.clearAllRoutes();
    this.directionsService = null;
    this.mapInstance = null;
  }

  getMapVendor(): MapVendor {
    return 'kakao';
  }

  getName(): string {
    return 'Kakao Directions';
  }

  getSupportedTravelModes(): string[] {
    return ['driving', 'walking'];
  }

  getMaxWaypoints(): number {
    return 6; // Kakao Maps는 최대 6개 waypoint 지원 (출발지 + 경유지 4개 + 목적지)
  }

  /**
   * travelMode를 Kakao Maps 형식으로 변환
   */
  private mapTravelMode(mode: string): any {
    switch (mode) {
      case 'driving':
        return window.kakao.maps.services.Directions.Priority.DRIVING;
      case 'walking':
        return window.kakao.maps.services.Directions.Priority.WALKING;
      default:
        return window.kakao.maps.services.Directions.Priority.DRIVING;
    }
  }

  /**
   * Kakao DirectionsResult를 Route로 변환
   */
  private convertKakaoRouteToRoute(result: any): Route {
    const route = result.routes[0];
    const summary = route.summary;

    // 경로 좌표 추출
    const polyline: Array<{ lat: number; lng: number }> = [];
    route.sections.forEach((section: any) => {
      section.roads.forEach((road: any) => {
        for (let i = 0; i < road.vertexes.length; i += 2) {
          polyline.push({
            lat: road.vertexes[i],
            lng: road.vertexes[i + 1],
          });
        }
      });
    });

    // 단계별 정보 추출
    const steps: any[] = [];
    route.sections.forEach((section: any) => {
      section.roads.forEach((road: any) => {
        steps.push({
          instruction: road.name || '',
          distance: road.distance || 0,
          duration: road.duration || 0,
          polyline: [],
        });
      });
    });

    return {
      id: `kakao-route-${Date.now()}`,
      distance: summary?.distance || 0,
      duration: summary?.duration || 0,
      polyline,
      steps,
    };
  }
}
