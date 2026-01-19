// routing/providers/GoogleRoutingProvider.ts

import { BaseRoutingProvider, RouteDisplay } from '../BaseRoutingProvider';
import { Waypoint, Route, RouteOptions, MapVendor } from '../../../types';

declare global {
  interface Window {
    google: any;
  }
}

/**
 * Google Maps 길찾기 제공자
 */
export class GoogleRoutingProvider implements BaseRoutingProvider {
  private mapInstance: google.maps.Map | null = null;
  private directionsService: google.maps.DirectionsService | null = null;
  private directionsRenderer: google.maps.DirectionsRenderer | null = null;
  private currentDisplay: RouteDisplay | null = null;

  init(mapInstance: any, config?: any): void {
    if (!window.google || !window.google.maps) {
      throw new Error('Google Maps SDK not loaded');
    }

    this.mapInstance = mapInstance;
    this.directionsService = new window.google.maps.DirectionsService();
    this.directionsRenderer = new window.google.maps.DirectionsRenderer({
      map: this.mapInstance,
      suppressMarkers: false,
      preserveViewport: false,
    });
  }

  async findRoute(
    waypoints: Waypoint[],
    options?: Partial<RouteOptions>
  ): Promise<Route | null> {
    if (!this.directionsService || !this.mapInstance) {
      throw new Error('GoogleRoutingProvider not initialized');
    }

    if (waypoints.length < 2) {
      console.warn('GoogleRoutingProvider: At least 2 waypoints required');
      return null;
    }

    // waypoints를 order 순서로 정렬
    const sortedWaypoints = [...waypoints].sort((a, b) => a.order - b.order);
    const origin = sortedWaypoints[0];
    const destination = sortedWaypoints[sortedWaypoints.length - 1];
    const intermediateWaypoints = sortedWaypoints.slice(1, -1);

    // Google Maps Directions API 요청
    const request: google.maps.DirectionsRequest = {
      origin: new window.google.maps.LatLng(origin.position.lat, origin.position.lng),
      destination: new window.google.maps.LatLng(
        destination.position.lat,
        destination.position.lng
      ),
      waypoints:
        intermediateWaypoints.length > 0
          ? intermediateWaypoints.map((wp) => ({
              location: new window.google.maps.LatLng(wp.position.lat, wp.position.lng),
              stopover: true,
            }))
          : undefined,
      travelMode: this.mapTravelMode(options?.travelMode || 'driving'),
      avoidHighways: options?.avoidHighways || false,
      avoidTolls: options?.avoidTolls || false,
      optimizeWaypoints: options?.optimizeWaypoints || false,
    };

    return new Promise((resolve, reject) => {
      this.directionsService!.route(request, (result, status) => {
        if (status === window.google.maps.DirectionsStatus.OK && result) {
          const route = this.convertGoogleRouteToRoute(result);
          resolve(route);
        } else {
          console.error('GoogleRoutingProvider: Route calculation failed', status);
          resolve(null);
        }
      });
    });
  }

  displayRoute(route: Route): RouteDisplay | null {
    if (!this.directionsRenderer || !this.mapInstance) {
      console.warn('GoogleRoutingProvider: Not initialized');
      return null;
    }

    // 기존 경로 제거
    this.clearRoute();

    // Google DirectionsResult로 변환 (간단한 버전)
    // 실제로는 findRoute에서 받은 결과를 저장해야 함
    // 여기서는 경로를 다시 표시하기 위해 polyline을 사용
    const path = route.polyline.map(
      (point) => new window.google.maps.LatLng(point.lat, point.lng)
    );

    const polyline = new window.google.maps.Polyline({
      path: path,
      geodesic: true,
      strokeColor: '#4285F4',
      strokeOpacity: 1.0,
      strokeWeight: 5,
    });

    polyline.setMap(this.mapInstance);

    const display: RouteDisplay = {
      id: route.id,
      route,
      remove: () => {
        polyline.setMap(null);
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
      },
    };

    this.currentDisplay = display;

    // 지도 범위 조정
    const bounds = new window.google.maps.LatLngBounds();
    route.polyline.forEach((point) => {
      bounds.extend(new window.google.maps.LatLng(point.lat, point.lng));
    });
    this.mapInstance.fitBounds(bounds);

    return display;
  }

  clearRoute(display?: RouteDisplay): void {
    if (display) {
      display.remove();
    } else if (this.currentDisplay) {
      this.currentDisplay.remove();
      this.currentDisplay = null;
    }

    if (this.directionsRenderer) {
      this.directionsRenderer.setDirections({ routes: [] });
    }
  }

  clearAllRoutes(): void {
    this.clearRoute();
  }

  cleanup(): void {
    this.clearAllRoutes();
    this.directionsService = null;
    this.directionsRenderer = null;
    this.mapInstance = null;
  }

  getMapVendor(): MapVendor {
    return 'google';
  }

  getName(): string {
    return 'Google Directions';
  }

  getSupportedTravelModes(): string[] {
    return ['driving', 'walking', 'transit', 'bicycling'];
  }

  getMaxWaypoints(): number {
    return 10; // Google Maps는 최대 10개 waypoint 지원
  }

  /**
   * travelMode를 Google Maps 형식으로 변환
   */
  private mapTravelMode(mode: string): google.maps.TravelMode {
    switch (mode) {
      case 'driving':
        return window.google.maps.TravelMode.DRIVING;
      case 'walking':
        return window.google.maps.TravelMode.WALKING;
      case 'transit':
        return window.google.maps.TravelMode.TRANSIT;
      case 'bicycling':
        return window.google.maps.TravelMode.BICYCLING;
      default:
        return window.google.maps.TravelMode.DRIVING;
    }
  }

  /**
   * Google DirectionsResult를 Route로 변환
   */
  private convertGoogleRouteToRoute(result: google.maps.DirectionsResult): Route {
    const route = result.routes[0];
    const leg = route.legs[0];

    // 경로 좌표 추출
    const polyline: Array<{ lat: number; lng: number }> = [];
    route.overview_path.forEach((point) => {
      polyline.push({ lat: point.lat(), lng: point.lng() });
    });

    // 단계별 정보 추출
    const steps = leg.steps.map((step) => ({
      instruction: step.instructions || '',
      distance: step.distance?.value || 0,
      duration: step.duration?.value || 0,
      polyline: step.path.map((p) => ({ lat: p.lat(), lng: p.lng() })),
    }));

    return {
      id: `google-route-${Date.now()}`,
      distance: leg.distance?.value || 0,
      duration: leg.duration?.value || 0,
      polyline,
      steps,
    };
  }
}
