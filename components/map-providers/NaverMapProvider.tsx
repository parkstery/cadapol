// map-providers/NaverMapProvider.tsx

import { BaseMapProvider, MapProvider, MapProviderConfig, MapState, MapCapabilities, Marker, MarkerOptions } from './BaseMapProvider';
import { Layer } from './BaseMapProvider';
import { LayerType } from '../../types';
import { SDK_CHECK_INTERVAL } from '../utils/constants';

/**
 * Naver Maps 제공자 구현
 */
export class NaverMapProvider implements MapProvider {
  private map: naver.maps.Map | null = null;
  private streetLayer: naver.maps.StreetLayer | null = null;
  private config: MapProviderConfig | null = null;
  private layers: Map<string, Layer> = new Map();
  private markers: Map<string, naver.maps.Marker> = new Map();
  private listeners: Array<{ event: string; handler: Function }> = [];
  private isProgrammaticUpdate: boolean = false;
  
  async init(config: MapProviderConfig): Promise<void> {
    this.config = config;
    
    // Naver Maps SDK 로드 대기
    await this.waitForSDK();
    
    if (!config.container) {
      throw new Error('Container element is required');
    }
    
    // Map 초기화
    this.map = new window.naver.maps.Map(config.container, {
      center: new window.naver.maps.LatLng(config.initialState.lat, config.initialState.lng),
      zoom: config.initialState.zoom,
      mapTypeId: config.isSatellite ? window.naver.maps.MapTypeId.SATELLITE : window.naver.maps.MapTypeId.NORMAL
    });
    
    // StreetLayer 초기화 (거리뷰용)
    this.streetLayer = new window.naver.maps.StreetLayer();
    
    this.setupListeners();
  }
  
  private async waitForSDK(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window.naver && window.naver.maps) {
        resolve();
        return;
      }
      
      const checkInterval = setInterval(() => {
        if (window.naver && window.naver.maps) {
          clearInterval(checkInterval);
          resolve();
        }
      }, SDK_CHECK_INTERVAL);
      
      setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error('Naver Maps SDK load timeout'));
      }, 10000);
    });
  }
  
  private setupListeners(): void {
    if (!this.map || !this.config) return;
    
    // dragstart 이벤트
    const dragStartListener = window.naver.maps.Event.addListener(this.map, 'dragstart', () => {
      // 드래그 시작 시 처리 (필요시)
    });
    this.listeners.push({ event: 'dragstart', handler: dragStartListener });
    
    // dragend 이벤트
    const dragEndListener = window.naver.maps.Event.addListener(this.map, 'dragend', () => {
      // 드래그 종료 시 처리 (필요시)
    });
    this.listeners.push({ event: 'dragend', handler: dragEndListener });
    
    // center_changed 이벤트
    const centerListener = window.naver.maps.Event.addListener(this.map, 'center_changed', () => {
      if (this.isProgrammaticUpdate || !this.config) return;
      
      try {
        const center = this.map!.getCenter();
        if (center) {
          const state: MapState = {
            lat: center.lat(),
            lng: center.lng(),
            zoom: this.map!.getZoom(),
          };
          this.config.onStateChange(state);
        }
      } catch (error) {
        console.error('NaverMapProvider center_changed error:', error);
      }
    });
    this.listeners.push({ event: 'center_changed', handler: centerListener });
    
    // zoom_changed 이벤트
    const zoomListener = window.naver.maps.Event.addListener(this.map, 'zoom_changed', () => {
      if (this.isProgrammaticUpdate || !this.config) return;
      
      try {
        const center = this.map!.getCenter();
        if (center) {
          const state: MapState = {
            lat: center.lat(),
            lng: center.lng(),
            zoom: this.map!.getZoom(),
          };
          this.config.onStateChange(state);
        }
      } catch (error) {
        console.error('NaverMapProvider zoom_changed error:', error);
      }
    });
    this.listeners.push({ event: 'zoom_changed', handler: zoomListener });
  }
  
  syncState(state: MapState): void {
    if (!this.map || this.isProgrammaticUpdate) return;
    
    // 좌표 유효성 검증
    if (typeof state.lat !== 'number' || typeof state.lng !== 'number' || 
        isNaN(state.lat) || isNaN(state.lng) || 
        !isFinite(state.lat) || !isFinite(state.lng)) {
      console.warn('NaverMapProvider syncState: 유효하지 않은 좌표', state);
      return;
    }
    
    this.isProgrammaticUpdate = true;
    
    try {
      this.map.setCenter(new window.naver.maps.LatLng(state.lat, state.lng));
      this.map.setZoom(state.zoom);
    } catch (error) {
      console.error('NaverMapProvider syncState error:', error);
    }
    
    // 프로그램적 업데이트 플래그 리셋
    setTimeout(() => {
      this.isProgrammaticUpdate = false;
    }, 200);
  }
  
  getState(): MapState {
    if (!this.map) {
      throw new Error('Map not initialized');
    }
    
    try {
      const center = this.map.getCenter();
      if (!center) {
        throw new Error('Map center not available');
      }
      
      return {
        lat: center.lat(),
        lng: center.lng(),
        zoom: this.map.getZoom(),
      };
    } catch (error) {
      throw new Error(`Failed to get map state: ${error}`);
    }
  }
  
  setSatelliteMode(enabled: boolean): void {
    if (!this.map) return;
    
    this.map.setMapTypeId(enabled ? window.naver.maps.MapTypeId.SATELLITE : window.naver.maps.MapTypeId.NORMAL);
  }
  
  setZoom(zoom: number): void {
    if (this.map) {
      this.map.setZoom(zoom);
    }
  }
  
  setCenter(lat: number, lng: number): void {
    if (this.map) {
      this.map.setCenter(new window.naver.maps.LatLng(lat, lng));
    }
  }
  
  setMarker(position: { lat: number; lng: number } | null): void {
    // 기존 기본 마커 제거
    const defaultMarker = this.markers.get('default');
    if (defaultMarker) {
      defaultMarker.setMap(null);
      this.markers.delete('default');
    }
    
    if (position && this.map) {
      const marker = new window.naver.maps.Marker({
        position: new window.naver.maps.LatLng(position.lat, position.lng),
        map: this.map,
      });
      this.markers.set('default', marker);
    }
  }
  
  addMarker(position: { lat: number; lng: number }, options?: MarkerOptions): Marker {
    if (!this.map) {
      throw new Error('Map not initialized');
    }
    
    const markerId = `marker-${Date.now()}-${Math.random()}`;
    
    const markerOptions: naver.maps.MarkerOptions = {
      position: new window.naver.maps.LatLng(position.lat, position.lng),
      map: this.map,
    };
    
    if (options?.title) {
      markerOptions.title = options.title;
    }
    
    if (options?.draggable !== undefined) {
      markerOptions.draggable = options.draggable;
    }
    
    // 아이콘 설정
    if (options?.icon) {
      if (typeof options.icon === 'string') {
        markerOptions.icon = {
          url: options.icon,
          size: new window.naver.maps.Size(24, 24),
        };
      } else {
        markerOptions.icon = {
          url: options.icon.url,
          size: new window.naver.maps.Size(
            options.icon.size?.width || 24,
            options.icon.size?.height || 24
          ),
        };
      }
    }
    
    const naverMarker = new window.naver.maps.Marker(markerOptions);
    this.markers.set(markerId, naverMarker);
    
    return {
      id: markerId,
      position,
      remove: () => {
        naverMarker.setMap(null);
        this.markers.delete(markerId);
      },
      updatePosition: (newPosition: { lat: number; lng: number }) => {
        naverMarker.setPosition(new window.naver.maps.LatLng(newPosition.lat, newPosition.lng));
      },
    };
  }
  
  removeMarker(marker: Marker): void {
    const naverMarker = this.markers.get(marker.id);
    if (naverMarker) {
      naverMarker.setMap(null);
      this.markers.delete(marker.id);
    }
  }
  
  addLayer(layer: Layer): void {
    this.layers.set(layer.getId(), layer);
    layer.attachToMap(this);
  }
  
  removeLayer(layer: Layer): void {
    const existingLayer = this.layers.get(layer.getId());
    if (existingLayer) {
      existingLayer.detachFromMap();
      this.layers.delete(layer.getId());
    }
  }
  
  getLayers(): Layer[] {
    return Array.from(this.layers.values());
  }
  
  on(event: string, handler: Function): void {
    if (this.map) {
      const listener = window.naver.maps.Event.addListener(this.map, event, handler);
      this.listeners.push({ event, handler: listener });
    }
  }
  
  off(event: string, handler: Function): void {
    if (this.map) {
      window.naver.maps.Event.removeListener(this.map, event, handler);
      this.listeners = this.listeners.filter(l => l.event !== event || l.handler !== handler);
    }
  }
  
  cleanup(): void {
    // 리스너 제거 (안전하게 처리)
    // 네이버맵 API: addListener가 반환한 리스너 객체를 removeListener에 직접 전달
    this.listeners.forEach(({ handler }) => {
      try {
        if (handler) {
          // 리스너 객체를 직접 전달 (가장 안전한 방법)
          window.naver.maps.Event.removeListener(handler);
        }
      } catch (error) {
        // 이미 제거된 리스너이거나 유효하지 않은 리스너인 경우 무시
        // 에러를 출력하지 않고 조용히 무시 (정상적인 상황일 수 있음)
      }
    });
    this.listeners = [];
    
    // 레이어 제거
    this.layers.forEach(layer => {
      layer.detachFromMap();
      layer.cleanup();
    });
    this.layers.clear();
    
    // 마커 제거
    this.markers.forEach(marker => marker.setMap(null));
    this.markers.clear();
    
    // StreetLayer 제거
    if (this.streetLayer) {
      this.streetLayer.setMap(null);
      this.streetLayer = null;
    }
    
    // Map 정리
    if (this.map) {
      // Naver Maps는 명시적인 destroy 메서드가 없음
      this.map = null;
    }
    
    this.config = null;
  }
  
  getMapInstance(): naver.maps.Map | null {
    return this.map;
  }
  
  /**
   * StreetLayer 인스턴스 접근 (거리뷰 기능에 사용)
   */
  getStreetLayer(): naver.maps.StreetLayer | null {
    return this.streetLayer;
  }
  
  getName(): string {
    return 'Naver';
  }
  
  getCapabilities(): MapCapabilities {
    return {
      supportsStreetView: true,  // 거리뷰(파노라마) 지원
      supportsRouting: true,
      supportsLayers: true,
      supportedLayerTypes: [LayerType.CUSTOM],
    };
  }
}
