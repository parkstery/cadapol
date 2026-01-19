// routing/BaseRoutingProvider.ts

import { Waypoint, Route, RouteOptions, MapVendor } from '../../types';

/**
 * 경로 표시 인터페이스
 */
export interface RouteDisplay {
  id: string;
  route: Route;
  remove(): void;
  highlight(): void;
  unhighlight(): void;
  setVisible(visible: boolean): void;
}

/**
 * 길찾기 제공자 기본 인터페이스
 * 모든 길찾기 제공자는 이 인터페이스를 구현해야 합니다.
 */
export interface BaseRoutingProvider {
  // 초기화
  init(mapInstance: any, config?: any): void;
  
  // 경로 계산
  findRoute(waypoints: Waypoint[], options?: Partial<RouteOptions>): Promise<Route | null>;
  
  // 경로 표시
  displayRoute(route: Route): RouteDisplay | null;
  
  // 경로 제거
  clearRoute(display?: RouteDisplay): void;
  
  // 모든 경로 제거
  clearAllRoutes(): void;
  
  // 리소스 정리
  cleanup(): void;
  
  // 제공자 정보
  getMapVendor(): MapVendor;
  getName(): string;
  getSupportedTravelModes(): string[];
  getMaxWaypoints(): number;
}
