
export type MapVendor = 'google' | 'kakao' | 'naver' | 'vworld' | 'osm';

export interface MapState {
  lat: number;
  lng: number;
  zoom: number;
}

export interface StreetViewState {
  lat: number;
  lng: number;
  active: boolean;
}

export interface PaneConfig {
  type: MapVendor;
  isSatellite: boolean;
}

export interface SearchResult {
  place_name: string;
  road_address_name: string;
  address_name: string;
  x: string;
  y: string;
}

export interface HistoryItem {
  name: string;
  lat: number;
  lng: number;
}

export enum GISMode {
  DEFAULT = 'default',
  ROADVIEW = 'roadview',
  DISTANCE = 'distance',
  AREA = 'area'
}

// 🆕 레이어 관련 타입
export enum LayerType {
  CADASTRAL = 'cadastral',
  ADMINISTRATIVE_BOUNDARY = 'administrative_boundary',
  TOPOGRAPHIC = 'topographic',
  CUSTOM = 'custom'
}

export interface LayerConfig {
  id: string;
  type: LayerType;
  name: string;
  visible: boolean;
  opacity: number;  // 0.0 ~ 1.0
  zIndex: number;
  provider?: MapVendor;  // 특정 제공자에서만 지원
  options?: Record<string, any>;  // 레이어별 추가 옵션
}

// 🆕 길찾기 관련 타입
export interface Waypoint {
  id: string;
  position: { lat: number; lng: number };
  label?: string;
  order: number;  // 0: 출발지, 1~4: 경유지, 마지막: 목적지
}

export interface RouteOptions {
  waypoints: Waypoint[];
  travelMode?: 'driving' | 'walking' | 'transit' | 'bicycling';
  avoidTolls?: boolean;
  avoidHighways?: boolean;
  optimizeWaypoints?: boolean;
}

export interface Route {
  id: string;
  distance: number;  // 미터
  duration: number;  // 초
  polyline: Array<{ lat: number; lng: number }>;
  steps?: RouteStep[];
}

export interface RouteStep {
  instruction: string;
  distance: number;
  duration: number;
  polyline: Array<{ lat: number; lng: number }>;
}

declare global {
  interface Window {
    kakao: any;
    google: any;
    naver: any;
    vworld?: any;
    L?: any;  // Leaflet for OSM
  }
}
