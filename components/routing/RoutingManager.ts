// routing/RoutingManager.ts

import { BaseRoutingProvider, RouteDisplay } from './BaseRoutingProvider';
import { Waypoint, Route, RouteOptions, MapVendor } from '../../types';

/**
 * 길찾기 관리자
 * 여러 경로를 관리하고 표시합니다.
 */
export class RoutingManager {
  private routingProvider: BaseRoutingProvider | null = null;
  private routeDisplays: Map<string, RouteDisplay> = new Map();
  private currentRoute: Route | null = null;

  /**
   * 길찾기 제공자 설정
   */
  setRoutingProvider(provider: BaseRoutingProvider): void {
    // 기존 제공자 정리
    if (this.routingProvider) {
      this.routingProvider.cleanup();
    }

    this.routingProvider = provider;
    this.clearAllRoutes();
  }

  /**
   * 경로 계산 및 표시
   */
  async calculateAndDisplayRoute(
    waypoints: Waypoint[],
    options?: Partial<RouteOptions>
  ): Promise<Route | null> {
    if (!this.routingProvider) {
      console.warn('RoutingManager: No routing provider set');
      return null;
    }

    // 최대 경유지 수 확인
    if (waypoints.length > this.routingProvider.getMaxWaypoints()) {
      console.warn(
        `RoutingManager: Too many waypoints. Max: ${this.routingProvider.getMaxWaypoints()}`
      );
      return null;
    }

    try {
      // 기존 경로 제거
      this.clearAllRoutes();

      // 경로 계산
      const route = await this.routingProvider.findRoute(waypoints, options);
      
      if (!route) {
        console.warn('RoutingManager: Route calculation failed');
        return null;
      }

      // 경로 표시
      const display = this.routingProvider.displayRoute(route);
      
      if (display) {
        this.routeDisplays.set(route.id, display);
        this.currentRoute = route;
      }

      return route;
    } catch (error) {
      console.error('RoutingManager: Error calculating route', error);
      return null;
    }
  }

  /**
   * 경로 제거
   */
  removeRoute(routeId: string): void {
    const display = this.routeDisplays.get(routeId);
    if (display) {
      display.remove();
      this.routeDisplays.delete(routeId);
      
      if (this.currentRoute && this.currentRoute.id === routeId) {
        this.currentRoute = null;
      }
    }
  }

  /**
   * 모든 경로 제거
   */
  clearAllRoutes(): void {
    this.routeDisplays.forEach((display) => {
      display.remove();
    });
    this.routeDisplays.clear();
    this.currentRoute = null;

    if (this.routingProvider) {
      this.routingProvider.clearAllRoutes();
    }
  }

  /**
   * 현재 경로 가져오기
   */
  getCurrentRoute(): Route | null {
    return this.currentRoute;
  }

  /**
   * 모든 경로 표시 가져오기
   */
  getAllRouteDisplays(): RouteDisplay[] {
    return Array.from(this.routeDisplays.values());
  }

  /**
   * 경로 하이라이트
   */
  highlightRoute(routeId: string): void {
    const display = this.routeDisplays.get(routeId);
    if (display) {
      display.highlight();
    }
  }

  /**
   * 경로 하이라이트 해제
   */
  unhighlightRoute(routeId: string): void {
    const display = this.routeDisplays.get(routeId);
    if (display) {
      display.unhighlight();
    }
  }

  /**
   * 리소스 정리
   */
  cleanup(): void {
    this.clearAllRoutes();
    
    if (this.routingProvider) {
      this.routingProvider.cleanup();
      this.routingProvider = null;
    }
  }

  /**
   * 길찾기 제공자 정보 가져오기
   */
  getRoutingProvider(): BaseRoutingProvider | null {
    return this.routingProvider;
  }
}
