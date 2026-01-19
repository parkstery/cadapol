// routing/BaseRoutingProvider.ts

import { RouteOptions, Route, RouteStep } from '../../types';
import { MapProvider } from '../map-providers/BaseMapProvider';

/**
 * 경로 표시 인터페이스
 */
export interface RouteDisplay {
  id: string;
  route: Route;
  remove(): void;
  highlight(): void;
  unhighlight(): void;
}

/**
 * 길찾기 제공자 기본 인터페이스
 * 모든 길찾기 제공자는 이 인터페이스를 구현해야 합니다.
 */
export interface RoutingProvider {
  // 경로 계산
  calculateRoute(options: RouteOptions): Promise<Route[]>;
  
  // 경로 표시
  displayRoute(route: Route, mapProvider: MapProvider): RouteDisplay;
  removeRoute(routeDisplay: RouteDisplay): void;
  
  // 제공자 정보
  getName(): string;
  getSupportedTravelModes(): string[];
  getMaxWaypoints(): number;  // 최대 경유지 수 (출발지 + 경유지 + 목적지)
}
