// map-providers/KakaoMapProvider.tsx

import { BaseMapProvider, MapProvider, MapProviderConfig, MapState, MapCapabilities, Marker, MarkerOptions } from './BaseMapProvider';
import { Layer } from './BaseMapProvider';
import { LayerType } from '../../types';
import { SDK_CHECK_INTERVAL, ZOOM_RANGE } from '../utils/constants';

/**
 * Kakao Maps 제공자 구현
 */
export class KakaoMapProvider implements MapProvider {
  private map: any = null;
  private config: MapProviderConfig | null = null;
  private layers: Map<string, Layer> = new Map();
  private markers: Map<string, any> = new Map();
  private listeners: Array<{ event: string; handler: Function }> = [];
  private isProgrammaticUpdate: boolean = false;
  private geocoder: any = null;
  private roadviewClient: any = null;
  
  // 줌 레벨 변환 헬퍼
  private zoomToKakao = (z: number) => Math.max(ZOOM_RANGE.KAKAO_MIN, Math.min(ZOOM_RANGE.KAKAO_MAX, 20 - z));
  private kakaoToZoom = (l: number) => Math.max(ZOOM_RANGE.MIN, Math.min(ZOOM_RANGE.MAX, 20 - l));
  
  async init(config: MapProviderConfig): Promise<void> {
    this.config = config;
    
    // Kakao Maps SDK 로드 대기
    await this.waitForSDK();
    
    if (!config.container) {
      throw new Error('Container element is required');
    }
    
    // Kakao Maps는 autoload=false이므로 load() 호출 필요
    await new Promise<void>((resolve, reject) => {
      if (!window.kakao || !window.kakao.maps) {
        reject(new Error('Kakao Maps SDK not loaded'));
        return;
      }
      
      if (typeof window.kakao.maps.load !== 'function') {
        reject(new Error('Kakao Maps load function not available'));
        return;
      }
      
      window.kakao.maps.load(() => {
        try {
          // Map 초기화
          const options = {
            center: new window.kakao.maps.LatLng(config.initialState.lat, config.initialState.lng),
            level: this.zoomToKakao(config.initialState.zoom)
          };
          
          this.map = new window.kakao.maps.Map(config.container, options);
          
          // 위성 모드 설정
          if (config.isSatellite) {
            this.map.setMapTypeId(window.kakao.maps.MapTypeId.HYBRID);
          }
          
          // Geocoder 초기화
          if (window.kakao.maps.services) {
            this.geocoder = new window.kakao.maps.services.Geocoder();
          }
          
          // RoadviewClient 초기화
          this.roadviewClient = new window.kakao.maps.RoadviewClient();
          
          this.setupListeners();
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  }
  
  private async waitForSDK(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window.kakao) {
        resolve();
        return;
      }
      
      const checkInterval = setInterval(() => {
        if (window.kakao) {
          clearInterval(checkInterval);
          resolve();
        }
      }, SDK_CHECK_INTERVAL);
      
      setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error('Kakao Maps SDK load timeout'));
      }, 10000);
    });
  }
  
  private setupListeners(): void {
    if (!this.map || !this.config) return;
    
    // dragstart 이벤트
    const dragStartListener = window.kakao.maps.event.addListener(this.map, 'dragstart', () => {
      // 드래그 시작 시 처리 (필요시)
    });
    this.listeners.push({ event: 'dragstart', handler: dragStartListener });
    
    // dragend 이벤트
    const dragEndListener = window.kakao.maps.event.addListener(this.map, 'dragend', () => {
      // 드래그 종료 시 처리 (필요시)
    });
    this.listeners.push({ event: 'dragend', handler: dragEndListener });
    
    // center_changed 이벤트
    const centerListener = window.kakao.maps.event.addListener(this.map, 'center_changed', () => {
      if (this.isProgrammaticUpdate || !this.config) return;
      
      try {
        const center = this.map.getCenter();
        if (center) {
          const level = this.map.getLevel();
          const state: MapState = {
            lat: center.getLat(),
            lng: center.getLng(),
            zoom: this.kakaoToZoom(level),
          };
          this.config.onStateChange(state);
        }
      } catch (error) {
        console.error('KakaoMapProvider center_changed error:', error);
      }
    });
    this.listeners.push({ event: 'center_changed', handler: centerListener });
    
    // zoom_changed 이벤트
    const zoomListener = window.kakao.maps.event.addListener(this.map, 'zoom_changed', () => {
      if (this.isProgrammaticUpdate || !this.config) return;
      
      try {
        const center = this.map.getCenter();
        if (center) {
          const level = this.map.getLevel();
          const state: MapState = {
            lat: center.getLat(),
            lng: center.getLng(),
            zoom: this.kakaoToZoom(level),
          };
          this.config.onStateChange(state);
        }
      } catch (error) {
        console.error('KakaoMapProvider zoom_changed error:', error);
      }
    });
    this.listeners.push({ event: 'zoom_changed', handler: zoomListener });
  }
  
  syncState(state: MapState): void {
    if (!this.map || this.isProgrammaticUpdate) return;
    
    this.isProgrammaticUpdate = true;
    
    try {
      const center = this.map.getCenter();
      const latDiff = Math.abs(center.getLat() - state.lat);
      const lngDiff = Math.abs(center.getLng() - state.lng);
      
      // 위치 차이가 크면 업데이트
      if (latDiff > 0.000001 || lngDiff > 0.000001) {
        this.map.setCenter(new window.kakao.maps.LatLng(state.lat, state.lng));
      }
      
      // 줌 레벨 변환 및 업데이트
      const kakaoLevel = this.zoomToKakao(state.zoom);
      this.map.setLevel(kakaoLevel);
    } catch (error) {
      console.error('KakaoMapProvider syncState error:', error);
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
      
      const level = this.map.getLevel();
      return {
        lat: center.getLat(),
        lng: center.getLng(),
        zoom: this.kakaoToZoom(level),
      };
    } catch (error) {
      throw new Error(`Failed to get map state: ${error}`);
    }
  }
  
  setSatelliteMode(enabled: boolean): void {
    if (!this.map) return;
    
    this.map.setMapTypeId(enabled ? window.kakao.maps.MapTypeId.HYBRID : window.kakao.maps.MapTypeId.ROADMAP);
  }
  
  setZoom(zoom: number): void {
    if (this.map) {
      const kakaoLevel = this.zoomToKakao(zoom);
      this.map.setLevel(kakaoLevel);
    }
  }
  
  setCenter(lat: number, lng: number): void {
    if (this.map) {
      this.map.setCenter(new window.kakao.maps.LatLng(lat, lng));
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
      const marker = new window.kakao.maps.Marker({
        position: new window.kakao.maps.LatLng(position.lat, position.lng),
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
    
    const markerOptions: any = {
      position: new window.kakao.maps.LatLng(position.lat, position.lng),
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
        markerOptions.image = new window.kakao.maps.MarkerImage(
          options.icon,
          new window.kakao.maps.Size(options.icon.includes('http') ? 24 : 24, options.icon.includes('http') ? 24 : 24)
        );
      } else {
        markerOptions.image = new window.kakao.maps.MarkerImage(
          options.icon.url,
          new window.kakao.maps.Size(
            options.icon.size?.width || 24,
            options.icon.size?.height || 24
          )
        );
      }
    }
    
    const kakaoMarker = new window.kakao.maps.Marker(markerOptions);
    this.markers.set(markerId, kakaoMarker);
    
    return {
      id: markerId,
      position,
      remove: () => {
        kakaoMarker.setMap(null);
        this.markers.delete(markerId);
      },
      updatePosition: (newPosition: { lat: number; lng: number }) => {
        kakaoMarker.setPosition(new window.kakao.maps.LatLng(newPosition.lat, newPosition.lng));
      },
    };
  }
  
  removeMarker(marker: Marker): void {
    const kakaoMarker = this.markers.get(marker.id);
    if (kakaoMarker) {
      kakaoMarker.setMap(null);
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
      const listener = window.kakao.maps.event.addListener(this.map, event, handler);
      this.listeners.push({ event, handler: listener });
    }
  }
  
  off(event: string, handler: Function): void {
    if (this.map) {
      window.kakao.maps.event.removeListener(this.map, event, handler);
      this.listeners = this.listeners.filter(l => l.event !== event || l.handler !== handler);
    }
  }
  
  cleanup(): void {
    // 리스너 제거 (안전하게 처리)
    this.listeners.forEach(({ event, handler }) => {
      try {
        if (this.map && handler && typeof handler === 'function') {
          window.kakao.maps.event.removeListener(this.map, event, handler);
        }
      } catch (error) {
        // 이미 제거된 리스너이거나 유효하지 않은 리스너인 경우 무시
      }
    });
    this.listeners = [];
    
    // 레이어 제거
    this.layers.forEach(layer => {
      try {
        layer.detachFromMap();
        layer.cleanup();
      } catch (error) {
        // 레이어 정리 중 오류 무시
      }
    });
    this.layers.clear();
    
    // 마커 제거
    this.markers.forEach(marker => {
      try {
        if (marker && marker.setMap) {
          marker.setMap(null);
        }
      } catch (error) {
        // 마커 제거 중 오류 무시
      }
    });
    this.markers.clear();
    
    // Geocoder 및 RoadviewClient 정리
    this.geocoder = null;
    this.roadviewClient = null;
    
    // Map 정리 (마지막에)
    if (this.map) {
      try {
        // 카카오맵은 명시적인 destroy 메서드가 없으므로 null로 설정
        // 컨테이너가 비워지면 자동으로 정리됨
        this.map = null;
      } catch (error) {
        // 맵 정리 중 오류 무시
      }
    }
    
    this.config = null;
  }
  
  getMapInstance(): any {
    return this.map;
  }
  
  /**
   * Geocoder 인스턴스 접근 (주소 변환 등에 사용)
   */
  getGeocoder(): any {
    return this.geocoder;
  }
  
  /**
   * RoadviewClient 인스턴스 접근 (로드뷰 기능에 사용)
   */
  getRoadviewClient(): any {
    return this.roadviewClient;
  }
  
  getName(): string {
    return 'Kakao';
  }
  
  getCapabilities(): MapCapabilities {
    return {
      supportsStreetView: true,  // 로드뷰 지원
      supportsRouting: true,
      supportsLayers: true,
      supportedLayerTypes: [LayerType.CADASTRAL, LayerType.CUSTOM],
    };
  }
}
