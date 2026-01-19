// map-providers/BaseMapProvider.ts

import { MapState, MapVendor, LayerType } from '../../types';

export interface MapProviderConfig {
  container: HTMLElement;
  initialState: MapState;
  isSatellite: boolean;
  onStateChange: (state: MapState) => void;
}

export interface MapCapabilities {
  supportsStreetView: boolean;
  supportsRouting: boolean;
  supportsLayers: boolean;
  supportedLayerTypes: LayerType[];
}

export interface Marker {
  id: string;
  position: { lat: number; lng: number };
  remove(): void;
  updatePosition(position: { lat: number; lng: number }): void;
}

export interface MarkerOptions {
  icon?: string | { url: string; size?: { width: number; height: number } };
  title?: string;
  draggable?: boolean;
}

/**
 * 맵 제공자 기본 인터페이스
 * 모든 맵 제공자는 이 인터페이스를 구현해야 합니다.
 */
export interface MapProvider {
  // 초기화
  init(config: MapProviderConfig): Promise<void>;
  
  // 상태 관리
  syncState(state: MapState): void;
  getState(): MapState;
  
  // 설정
  setSatelliteMode(enabled: boolean): void;
  setZoom(zoom: number): void;
  setCenter(lat: number, lng: number): void;
  
  // 마커 관리
  setMarker(position: { lat: number; lng: number } | null): void;
  addMarker(position: { lat: number; lng: number }, options?: MarkerOptions): Marker;
  removeMarker(marker: Marker): void;
  
  // 레이어 관리
  addLayer(layer: Layer): void;
  removeLayer(layer: Layer): void;
  getLayers(): Layer[];
  
  // 이벤트
  on(event: string, handler: Function): void;
  off(event: string, handler: Function): void;
  
  // 리소스 관리
  cleanup(): void;
  
  // 인스턴스 접근
  getMapInstance(): any;
  
  // 제공자 정보
  getName(): string;
  getCapabilities(): MapCapabilities;
}

/**
 * 레이어 기본 인터페이스
 * 모든 레이어는 이 인터페이스를 구현해야 합니다.
 */
export interface Layer {
  // 기본 정보
  getId(): string;
  getType(): LayerType;
  getName(): string;
  
  // 표시 제어
  show(): void;
  hide(): void;
  isVisible(): boolean;
  setOpacity(opacity: number): void;
  getOpacity(): number;
  setZIndex(zIndex: number): void;
  getZIndex(): number;
  
  // 맵 연결
  attachToMap(mapProvider: MapProvider): void | Promise<void>;
  detachFromMap(): void;
  
  // 리소스 관리
  cleanup(): void;
}
