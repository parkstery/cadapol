// map-providers/GoogleMapProvider.tsx

import { BaseMapProvider, MapProvider, MapProviderConfig, MapState, MapCapabilities, Marker, MarkerOptions } from './BaseMapProvider';
import { Layer } from './BaseMapProvider';
import { LayerType } from '../../types';
import { SDK_CHECK_INTERVAL } from '../utils/constants';

/**
 * Google Maps 제공자 구현
 */
export class GoogleMapProvider implements MapProvider {
  private map: google.maps.Map | null = null;
  private panorama: google.maps.StreetViewPanorama | null = null;
  private coverageLayer: google.maps.StreetViewCoverageLayer | null = null;
  private config: MapProviderConfig | null = null;
  private layers: Map<string, Layer> = new Map();
  private markers: Map<string, google.maps.Marker> = new Map();
  private listeners: google.maps.MapsEventListener[] = [];
  private isProgrammaticUpdate: boolean = false;
  private panoContainer: HTMLDivElement | null = null;
  
  async init(config: MapProviderConfig): Promise<void> {
    this.config = config;
    
    // Google Maps SDK 로드 대기
    await this.waitForSDK();
    
    if (!config.container) {
      throw new Error('Container element is required');
    }
    
    // 거리뷰용 컨테이너 생성 (기존 구조와 호환)
    this.panoContainer = document.createElement('div');
    this.panoContainer.style.display = 'none';
    config.container.appendChild(this.panoContainer);
    
    // StreetView Panorama 초기화
    this.panorama = new google.maps.StreetViewPanorama(this.panoContainer, {
      visible: false,
      enableCloseButton: false,
    });
    
    // Coverage Layer 초기화
    this.coverageLayer = new google.maps.StreetViewCoverageLayer();
    
    // Map 초기화
    this.map = new google.maps.Map(config.container, {
      center: { lat: config.initialState.lat, lng: config.initialState.lng },
      zoom: config.initialState.zoom,
      mapTypeId: config.isSatellite ? 'satellite' : 'roadmap',
      disableDefaultUI: false,
      zoomControl: true,
      streetViewControl: true,
      streetViewControlOptions: {
        position: google.maps.ControlPosition.TOP_RIGHT
      },
      fullscreenControl: false,
      streetView: this.panorama,
      gestureHandling: 'greedy'
    });
    
    this.setupListeners();
  }
  
  private async waitForSDK(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window.google && window.google.maps) {
        resolve();
        return;
      }
      
      const checkInterval = setInterval(() => {
        if (window.google && window.google.maps) {
          clearInterval(checkInterval);
          resolve();
        }
      }, SDK_CHECK_INTERVAL);
      
      setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error('Google Maps SDK load timeout'));
      }, 10000);
    });
  }
  
  private setupListeners(): void {
    if (!this.map || !this.config) return;
    
    // center_changed 이벤트
    const centerListener = this.map.addListener('center_changed', () => {
      if (this.isProgrammaticUpdate || !this.config) return;
      
      const center = this.map!.getCenter();
      if (center) {
        const state: MapState = {
          lat: center.lat(),
          lng: center.lng(),
          zoom: this.map!.getZoom() || 17,
        };
        this.config.onStateChange(state);
      }
    });
    this.listeners.push(centerListener);
    
    // zoom_changed 이벤트
    const zoomListener = this.map.addListener('zoom_changed', () => {
      if (this.isProgrammaticUpdate || !this.config) return;
      
      const center = this.map!.getCenter();
      if (center) {
        const state: MapState = {
          lat: center.lat(),
          lng: center.lng(),
          zoom: this.map!.getZoom() || 17,
        };
        this.config.onStateChange(state);
      }
    });
    this.listeners.push(zoomListener);
  }
  
  syncState(state: MapState): void {
    if (!this.map || this.isProgrammaticUpdate) return;
    
    this.isProgrammaticUpdate = true;
    
    try {
      this.map.setCenter({ lat: state.lat, lng: state.lng });
      this.map.setZoom(state.zoom);
    } catch (error) {
      console.error('GoogleMapProvider syncState error:', error);
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
    
    const center = this.map.getCenter();
    if (!center) {
      throw new Error('Map center not available');
    }
    
    return {
      lat: center.lat(),
      lng: center.lng(),
      zoom: this.map.getZoom() || 17,
    };
  }
  
  setSatelliteMode(enabled: boolean): void {
    if (!this.map) return;
    
    this.map.setMapTypeId(enabled ? 'satellite' : 'roadmap');
  }
  
  setZoom(zoom: number): void {
    if (this.map) {
      this.map.setZoom(zoom);
    }
  }
  
  setCenter(lat: number, lng: number): void {
    if (this.map) {
      this.map.setCenter({ lat, lng });
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
      const marker = new google.maps.Marker({
        position: { lat: position.lat, lng: position.lng },
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
    
    const markerOptions: google.maps.MarkerOptions = {
      position: { lat: position.lat, lng: position.lng },
      map: this.map,
    };
    
    if (options?.icon) {
      if (typeof options.icon === 'string') {
        markerOptions.icon = options.icon;
      } else {
        markerOptions.icon = {
          url: options.icon.url,
          scaledSize: options.icon.size ? new google.maps.Size(options.icon.size.width, options.icon.size.height) : undefined,
        };
      }
    }
    
    if (options?.title) {
      markerOptions.title = options.title;
    }
    
    if (options?.draggable !== undefined) {
      markerOptions.draggable = options.draggable;
    }
    
    const googleMarker = new google.maps.Marker(markerOptions);
    this.markers.set(markerId, googleMarker);
    
    return {
      id: markerId,
      position,
      remove: () => {
        googleMarker.setMap(null);
        this.markers.delete(markerId);
      },
      updatePosition: (newPosition: { lat: number; lng: number }) => {
        googleMarker.setPosition({ lat: newPosition.lat, lng: newPosition.lng });
      },
    };
  }
  
  removeMarker(marker: Marker): void {
    const googleMarker = this.markers.get(marker.id);
    if (googleMarker) {
      googleMarker.setMap(null);
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
      const listener = this.map.addListener(event, handler);
      this.listeners.push(listener);
    }
  }
  
  off(event: string, handler: Function): void {
    // Google Maps API는 handler로 직접 제거할 수 없으므로
    // 모든 리스너를 추적하여 관리
    // 실제 구현에서는 더 정교한 관리가 필요할 수 있음
    console.warn('GoogleMapProvider.off() - handler-based removal not fully supported');
  }
  
  cleanup(): void {
    // 리스너 제거
    this.listeners.forEach(listener => {
      google.maps.event.removeListener(listener);
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
    
    // Coverage Layer 제거
    if (this.coverageLayer) {
      this.coverageLayer.setMap(null);
      this.coverageLayer = null;
    }
    
    // Panorama 정리
    if (this.panorama) {
      this.panorama = null;
    }
    
    // Map 정리
    if (this.map) {
      // Google Maps는 명시적인 destroy 메서드가 없음
      this.map = null;
    }
    
    // 컨테이너 정리
    if (this.panoContainer && this.panoContainer.parentNode) {
      this.panoContainer.parentNode.removeChild(this.panoContainer);
      this.panoContainer = null;
    }
    
    this.config = null;
  }
  
  getMapInstance(): google.maps.Map | null {
    return this.map;
  }
  
  /**
   * StreetView Panorama 인스턴스 접근 (거리뷰 기능용)
   */
  getPanoramaInstance(): google.maps.StreetViewPanorama | null {
    return this.panorama;
  }
  
  /**
   * Coverage Layer 인스턴스 접근 (거리뷰 기능용)
   */
  getCoverageLayer(): google.maps.StreetViewCoverageLayer | null {
    return this.coverageLayer;
  }
  
  getName(): string {
    return 'Google';
  }
  
  getCapabilities(): MapCapabilities {
    return {
      supportsStreetView: true,
      supportsRouting: true,
      supportsLayers: true,
      supportedLayerTypes: [LayerType.CUSTOM],
    };
  }
}
