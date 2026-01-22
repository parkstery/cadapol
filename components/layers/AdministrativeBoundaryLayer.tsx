// layers/AdministrativeBoundaryLayer.tsx

import { LayerConfig, LayerType } from '../../types';
import { Layer, MapProvider } from '../map-providers/BaseMapProvider';
import { VWorldAPI, AdministrativeBoundary } from '../utils/vworldApi';
import proj4 from 'proj4';

export class AdministrativeBoundaryLayer implements Layer {
  private config: LayerConfig;
  private mapProvider: MapProvider | null = null;
  private polygons: any[] = [];
  private clickListener: any = null;
  
  constructor(config: LayerConfig) {
    this.config = config;
    // ✅ 클릭 기반으로 변경: 시도/시군구 제거, 읍면동만 사용
  }
  
  getId(): string {
    return this.config.id;
  }
  
  getType(): LayerType {
    return LayerType.ADMINISTRATIVE_BOUNDARY;
  }
  
  getName(): string {
    return this.config.name;
  }
  
  show(): void {
    this.config.visible = true;
    this.updateVisibility();
  }
  
  hide(): void {
    this.config.visible = false;
    this.updateVisibility();
  }
  
  isVisible(): boolean {
    return this.config.visible;
  }
  
  setOpacity(opacity: number): void {
    this.config.opacity = Math.max(0, Math.min(1, opacity));
    this.updateOpacity();
  }
  
  getOpacity(): number {
    return this.config.opacity;
  }
  
  setZIndex(zIndex: number): void {
    this.config.zIndex = zIndex;
    this.updateZIndex();
  }
  
  getZIndex(): number {
    return this.config.zIndex;
  }
  
  /**
   * bbox 면적 계산 (deg²)
   */
  private calculateBBoxArea(bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number }): number {
    return Math.abs((bounds.maxLng - bounds.minLng) * (bounds.maxLat - bounds.minLat));
  }

  /**
   * 줌 레벨에 따라 적절한 행정경계 레벨 결정 (자문단 권장)
   */
  private determineLevelByZoom(zoom: number): 'sido' | 'sigungu' | 'emd' {
    if (zoom >= 14) {
      return 'emd';
    } else if (zoom >= 12) {
      return 'sigungu';
    } else {
      return 'sido';
    }
  }

  /**
   * emd 레벨 요청 가능 여부 확인 (bbox 면적 제한)
   */
  private canLoadEmd(bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number }, zoom: number): boolean {
    // 줌 레벨 체크
    if (zoom < 14) {
      return false;
    }
    
    // bbox 면적 체크 (안전 상한: 0.0001 deg²)
    const MAX_EMD_BBOX_AREA = 0.0001;
    const area = this.calculateBBoxArea(bounds);
    
    if (area > MAX_EMD_BBOX_AREA) {
      console.info(`[Boundary] EMD bbox too large (${area.toFixed(6)} > ${MAX_EMD_BBOX_AREA}), fallback to sigungu`);
      return false;
    }
    
    return true;
  }

  /**
   * 클릭 좌표로 읍면동 단일 폴리곤 조회 (자문단 권장 방식)
   */
  private async loadEmdByPoint(lat: number, lng: number): Promise<void> {
    if (!this.mapProvider) {
      console.warn('[Boundary] Map provider not available');
      return;
    }
    
    console.log(`[Boundary] Loading emd boundary for point: lat=${lat}, lng=${lng}`);
    
    try {
      // ✅ 좌표 기반 읍면동 조회 (geomFilter=POINT 사용)
      console.log('[Boundary] Calling VWorldAPI.getAdministrativeBoundaryByPoint...');
      const boundaries = await VWorldAPI.getAdministrativeBoundaryByPoint(lat, lng);
      console.log(`[Boundary] Received ${boundaries.length} boundaries from API`);
      
      if (boundaries.length === 0) {
        console.warn('[Boundary] No emd boundary found for the clicked point');
        return;
      }
      
      // 기존 폴리곤 제거
      console.log(`[Boundary] Removing ${this.polygons.length} existing polygons`);
      this.polygons.forEach(polygon => {
        try {
          if (polygon && typeof polygon.setMap === 'function') {
            polygon.setMap(null);
          } else if (polygon && typeof polygon.setVisible === 'function') {
            polygon.setVisible(false);
          }
        } catch (e) {
          console.warn('Failed to remove polygon:', e);
        }
      });
      this.polygons = [];
      
      // 새 폴리곤 생성 (단일 읍면동만)
      const boundary = boundaries[0];
      console.log(`[Boundary] Creating polygon for boundary: ${boundary.name} (${boundary.id})`);
      try {
        const polygon = this.createPolygon(boundary, this.mapProvider);
        if (polygon) {
          this.polygons = [polygon];
          console.log(`[Boundary] Polygon created successfully`);
          
          if (this.config.visible) {
            console.log('[Boundary] Updating visibility...');
            this.updateVisibility();
            console.log('[Boundary] Visibility updated');
          } else {
            console.warn('[Boundary] Layer is not visible, polygon may not be shown');
          }
          
          console.log(`[Boundary] Successfully loaded emd boundary: ${boundary.name}`);
        } else {
          console.error('[Boundary] createPolygon returned null');
        }
      } catch (error) {
        console.error('[Boundary] Failed to create polygon for boundary:', boundary.id, error);
        console.error('[Boundary] Error details:', error);
      }
    } catch (error) {
      console.error('[Boundary] Failed to load emd boundary by point:', error);
      console.error('[Boundary] Error stack:', (error as Error).stack);
    }
  }

  async attachToMap(mapProvider: MapProvider): Promise<void> {
    this.mapProvider = mapProvider;
    const mapInstance = mapProvider.getMapInstance();
    
    if (!mapInstance) {
      throw new Error('Map instance not available');
    }
    
    try {
      // ✅ 맵이 준비될 때까지 짧은 대기
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // ✅ 클릭 이벤트 리스너 등록 (클릭 위치의 최소 행정구역 표시)
      const providerName = mapProvider.getName();
      
      if (providerName === 'kakao') {
        this.clickListener = (e: any) => {
          console.log('[Boundary] Click event received (Kakao)');
          const pos = e.latLng;
          if (pos) {
            const lat = pos.getLat();
            const lng = pos.getLng();
            console.log(`[Boundary] Click coordinates: lat=${lat}, lng=${lng}`);
            this.loadEmdByPoint(lat, lng);
          } else {
            console.warn('[Boundary] No latLng in click event');
          }
        };
        window.kakao.maps.event.addListener(mapInstance, 'click', this.clickListener);
        console.log('[Boundary] Kakao click listener registered');
      } else if (providerName === 'google') {
        this.clickListener = (e: any) => {
          console.log('[Boundary] Click event received (Google)');
          if (e.latLng) {
            const lat = e.latLng.lat();
            const lng = e.latLng.lng();
            console.log(`[Boundary] Click coordinates: lat=${lat}, lng=${lng}`);
            this.loadEmdByPoint(lat, lng);
          } else {
            console.warn('[Boundary] No latLng in click event');
          }
        };
        mapInstance.addListener('click', this.clickListener);
        console.log('[Boundary] Google click listener registered');
      } else if (providerName === 'naver') {
        this.clickListener = (e: any) => {
          console.log('[Boundary] Click event received (Naver)');
          if (e.coord) {
            const lat = e.coord.lat();
            const lng = e.coord.lng();
            console.log(`[Boundary] Click coordinates: lat=${lat}, lng=${lng}`);
            this.loadEmdByPoint(lat, lng);
          } else {
            console.warn('[Boundary] No coord in click event');
          }
        };
        window.naver.maps.Event.addListener(mapInstance, 'click', this.clickListener);
        console.log('[Boundary] Naver click listener registered');
      }
      
      console.log('[Boundary] Click listener registered. Click on map to show emd boundary.');
      
    } catch (error) {
      console.error('AdministrativeBoundaryLayer: Failed to attach to map', error);
      throw error;
    }
  }
  
  detachFromMap(): void {
    // 클릭 리스너 제거
    if (this.clickListener && this.mapProvider) {
      const mapInstance = this.mapProvider.getMapInstance();
      const providerName = this.mapProvider.getName();
      
      try {
        if (providerName === 'kakao' && mapInstance) {
          window.kakao.maps.event.removeListener(mapInstance, 'click', this.clickListener);
        } else if (providerName === 'google' && mapInstance) {
          window.google.maps.event.removeListener(this.clickListener);
        } else if (providerName === 'naver' && mapInstance) {
          window.naver.maps.Event.removeListener(this.clickListener);
        }
      } catch (e) {
        console.warn('Failed to remove click listener:', e);
      }
      this.clickListener = null;
    }
    
    // 폴리곤 제거
    this.polygons.forEach(polygon => {
      try {
        if (polygon && typeof polygon.setMap === 'function') {
          polygon.setMap(null);
        } else if (polygon && typeof polygon.setVisible === 'function') {
          polygon.setVisible(false);
        }
      } catch (e) {
        console.warn('Failed to remove polygon:', e);
      }
    });
    this.polygons = [];
    
    this.mapProvider = null;
  }
  
  private async getMapBoundsWithRetry(
    mapInstance: any,
    providerName: string,
    maxRetries: number
  ): Promise<{ minLat: number; minLng: number; maxLat: number; maxLng: number } | undefined> {
    // ✅ 더 관대한 재시도 로직: 각 시도 사이에 대기 시간 증가
    for (let i = 0; i < maxRetries; i++) {
      try {
        const bounds = this.getMapBounds(mapInstance, providerName);
        if (bounds) return bounds;
      } catch (error) {
        // 에러가 발생해도 계속 시도
        console.warn(`Attempt ${i + 1} failed to get bounds:`, error);
      }
      
      // 재시도 간 대기 시간 (점진적 증가)
      const delay = 200 * (i + 1); // 200ms, 400ms, 600ms, 800ms, 1000ms
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    return undefined;
  }
  
  detachFromMap(): void {
    this.hide();
    this.mapProvider = null;
  }
  
  private getMapBounds(mapInstance: any, providerName: string): { minLat: number; minLng: number; maxLat: number; maxLng: number } | undefined {
    try {
      if (providerName === 'google') {
        const bounds = mapInstance.getBounds();
        if (bounds && bounds.getNorthEast && bounds.getSouthWest) {
          const ne = bounds.getNorthEast();
          const sw = bounds.getSouthWest();
          if (ne && sw) {
            return {
              minLat: sw.lat(),
              minLng: sw.lng(),
              maxLat: ne.lat(),
              maxLng: ne.lng()
            };
          }
        }
        // bounds를 가져오지 못한 경우 center와 zoom으로 계산
        const center = mapInstance.getCenter();
        const zoom = mapInstance.getZoom();
        if (center && zoom !== undefined) {
          return this.calculateBoundsFromCenter(center.lat(), center.lng(), zoom, 'google');
        }
      } else if (providerName === 'kakao') {
        const bounds = mapInstance.getBounds();
        if (bounds && bounds.getSouthWest && bounds.getNorthEast) {
          const sw = bounds.getSouthWest();
          const ne = bounds.getNorthEast();
          if (sw && ne) {
            return {
              minLat: sw.getLat(),
              minLng: sw.getLng(),
              maxLat: ne.getLat(),
              maxLng: ne.getLng()
            };
          }
        }
        // bounds를 가져오지 못한 경우 center와 level로 계산
        const center = mapInstance.getCenter();
        const level = mapInstance.getLevel();
        if (center && level !== undefined) {
          const zoom = 20 - level; // 카카오 level을 zoom으로 변환
          return this.calculateBoundsFromCenter(center.getLat(), center.getLng(), zoom, 'kakao');
        }
      } else if (providerName === 'naver') {
        const bounds = mapInstance.getBounds();
        if (bounds && bounds.getSW && bounds.getNE) {
          const sw = bounds.getSW();
          const ne = bounds.getNE();
          if (sw && ne) {
            return {
              minLat: sw.lat(),
              minLng: sw.lng(),
              maxLat: ne.lat(),
              maxLng: ne.lng()
            };
          }
        }
        // bounds를 가져오지 못한 경우 center와 zoom으로 계산
        const center = mapInstance.getCenter();
        const zoom = mapInstance.getZoom();
        if (center && zoom !== undefined) {
          return this.calculateBoundsFromCenter(center.lat(), center.lng(), zoom, 'naver');
        }
      }
    } catch (error) {
      console.warn('Failed to get map bounds', error);
    }
    return undefined;
  }
  
  /**
   * 지도 중심 좌표 가져오기 (dong 레벨 테스트용)
   */
  private getMapCenter(mapInstance: any, providerName: string): { lat: number; lng: number } | null {
    try {
      if (providerName === 'google') {
        const center = mapInstance.getCenter();
        if (center) {
          return {
            lat: center.lat(),
            lng: center.lng()
          };
        }
      } else if (providerName === 'kakao') {
        const center = mapInstance.getCenter();
        if (center && typeof center.getLat === 'function') {
          return {
            lat: center.getLat(),
            lng: center.getLng()
          };
        }
      } else if (providerName === 'naver') {
        const center = mapInstance.getCenter();
        if (center && typeof center.lat === 'function') {
          return {
            lat: center.lat(),
            lng: center.lng()
          };
        } else if (center && typeof center.y === 'number') {
          // Naver Maps v3 API
          return {
            lat: center.y,
            lng: center.x
          };
        }
      }
    } catch (error) {
      console.warn('Failed to get map center:', error);
    }
    return null;
  }
  
  /**
   * center와 zoom으로부터 bounds 계산
   */
  private calculateBoundsFromCenter(lat: number, lng: number, zoom: number, providerName: string): { minLat: number; minLng: number; maxLat: number; maxLng: number } {
    // zoom 레벨에 따른 대략적인 범위 계산
    // zoom 1 = 전체 지구, zoom 20 = 매우 좁은 영역
    const degreesPerPixel = 360 / (256 * Math.pow(2, zoom));
    const mapWidth = 800; // 대략적인 맵 너비 (픽셀)
    const mapHeight = 600; // 대략적인 맵 높이 (픽셀)
    
    const latRange = (mapHeight * degreesPerPixel) / 2;
    const lngRange = (mapWidth * degreesPerPixel) / 2;
    
    return {
      minLat: lat - latRange,
      minLng: lng - lngRange,
      maxLat: lat + latRange,
      maxLng: lng + lngRange
    };
  }
  
  private createPolygon(boundary: AdministrativeBoundary, mapProvider: MapProvider): any {
    console.log(`[Boundary] createPolygon called for: ${boundary.name} (${boundary.id})`);
    const mapInstance = mapProvider.getMapInstance();
    const providerName = mapProvider.getName();
    
    if (!mapInstance) {
      console.error('[Boundary] Map instance not available for polygon creation');
      return null;
    }
    
    try {
      console.log(`[Boundary] Parsing geometry for boundary: ${boundary.id}`);
      const paths = this.parseGeometry(boundary.geometry);
      console.log(`[Boundary] Parsed ${paths.length} paths from geometry`);
      
      if (paths.length === 0) {
        console.warn(`[Boundary] No paths found for boundary: ${boundary.id}`);
        return null;
      }
      
      // ✅ 최소 3개 점 필요 (폴리곤)
      if (paths.length < 3) {
        console.warn(`[Boundary] Insufficient points for polygon: ${boundary.id} (${paths.length} points)`);
        return null;
      }
      
      let polygon: any = null;
      
      if (providerName === 'google') {
        const googlePaths = paths.map(p => ({ lat: p[1], lng: p[0] }));
        console.log(`[Boundary] Creating Google polygon with ${googlePaths.length} points`);
        polygon = new window.google.maps.Polygon({
          paths: googlePaths,
          strokeColor: '#4285F4',
          strokeOpacity: this.config.opacity,
          strokeWeight: 2,
          fillColor: '#4285F4',
          fillOpacity: this.config.opacity * 0.2,
          map: this.config.visible ? mapInstance : null,
          zIndex: this.config.zIndex
        });
      } else if (providerName === 'kakao') {
        const kakaoPaths = paths.map(p => new window.kakao.maps.LatLng(p[1], p[0]));
        console.log(`[Boundary] Creating Kakao polygon with ${kakaoPaths.length} points`);
        polygon = new window.kakao.maps.Polygon({
          path: kakaoPaths,
          strokeWeight: 2,
          strokeColor: '#4285F4',
          strokeOpacity: this.config.opacity,
          strokeStyle: 'solid',
          fillColor: '#4285F4',
          fillOpacity: this.config.opacity * 0.2,
          map: this.config.visible ? mapInstance : null,
          zIndex: this.config.zIndex
        });
        console.log(`[Boundary] Kakao polygon created, visible: ${this.config.visible}, map: ${mapInstance ? 'exists' : 'null'}`);
      } else if (providerName === 'naver') {
        const naverPaths = paths.map(p => new window.naver.maps.LatLng(p[1], p[0]));
        console.log(`[Boundary] Creating Naver polygon with ${naverPaths.length} points`);
        polygon = new window.naver.maps.Polygon({
          paths: naverPaths,
          strokeColor: '#4285F4',
          strokeOpacity: this.config.opacity,
          strokeWeight: 2,
          fillColor: '#4285F4',
          fillOpacity: this.config.opacity * 0.2,
          map: this.config.visible ? mapInstance : null,
          zIndex: this.config.zIndex
        });
        console.log(`[Boundary] Naver polygon created, visible: ${this.config.visible}, map: ${mapInstance ? 'exists' : 'null'}`);
      } else {
        console.error(`[Boundary] Unsupported map provider: ${providerName}`);
        return null;
      }
      
      if (polygon) {
        console.log(`[Boundary] Polygon created successfully for ${boundary.name}`);
      } else {
        console.error(`[Boundary] Failed to create polygon for ${boundary.name}`);
      }
      
      return polygon;
    } catch (error) {
      console.error(`Failed to create polygon for boundary ${boundary.id}:`, error);
      return null;
    }
  }
  
  private parseGeometry(geometry: any): number[][] {
    if (!geometry || !geometry.coordinates) {
      console.warn('Invalid geometry: missing coordinates');
      return [];
    }
    
    try {
      if (geometry.type === 'Polygon') {
        // Polygon의 첫 번째 ring (외곽 경계)만 사용
        const outerRing = geometry.coordinates[0];
        if (!outerRing || outerRing.length === 0) {
          console.warn('Empty polygon ring');
          return [];
        }
        
        // ✅ 좌표계 감지 개선
        const firstPoint = outerRing[0];
        const isTM = this.detectTMCoordinateSystem(firstPoint);
        
        if (isTM && proj4) {
          try {
            proj4.defs("EPSG:5179", "+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs");
            const proj = proj4("EPSG:5179", "EPSG:4326");
            return outerRing.map((coord: number[]) => {
              try {
                const [lon, lat] = proj.forward([coord[0], coord[1]]);
                // ✅ 좌표 유효성 검증
                if (isNaN(lon) || isNaN(lat) || !isFinite(lon) || !isFinite(lat)) {
                  console.warn('Invalid converted coordinate:', coord);
                  return null;
                }
                // ✅ 경도/위도 범위 검증
                if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
                  console.warn('Coordinate out of range:', { lon, lat });
                  return null;
                }
                return [lon, lat];
              } catch (e) {
                console.error('Coordinate conversion error:', e, coord);
                return null;
              }
            }).filter(coord => coord !== null) as number[][];
          } catch (e) {
            console.error("Proj4 conversion error", e);
            return [];
          }
        } else {
          // ✅ 이미 WGS84인 경우에도 유효성 검증
          return outerRing
            .map((coord: number[]) => {
              const [lon, lat] = coord;
              if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
                console.warn('Coordinate out of range:', coord);
                return null;
              }
              return [lon, lat];
            })
            .filter(coord => coord !== null) as number[][];
        }
      } else if (geometry.type === 'MultiPolygon') {
        // MultiPolygon의 경우 첫 번째 Polygon만 사용
        if (geometry.coordinates && geometry.coordinates.length > 0) {
          return this.parseGeometry({ type: 'Polygon', coordinates: geometry.coordinates[0] });
        }
      } else {
        console.warn(`Unsupported geometry type: ${geometry.type}`);
      }
    } catch (e) {
      console.error("Geometry parsing error", e);
    }
    
    return [];
  }
  
  // ✅ 새로운 좌표계 감지 메서드
  private detectTMCoordinateSystem(point: number[]): boolean {
    if (!point || point.length < 2) return false;
    
    const [x, y] = point;
    
    // EPSG:5179 (TM) 좌표 범위: 대략 x: 100000~2000000, y: 100000~3000000
    // WGS84 좌표 범위: 경도 -180~180, 위도 -90~90
    if (Math.abs(x) > 180 || Math.abs(y) > 90) {
      // 경도/위도 범위를 벗어나면 TM 좌표로 간주
      return true;
    }
    
    // 추가 검증: TM 좌표는 보통 큰 값
    if (Math.abs(x) > 100000 || Math.abs(y) > 100000) {
      return true;
    }
    
    return false;
  }
  
  private updateVisibility(): void {
    console.log(`[Boundary] updateVisibility called. Visible: ${this.config.visible}, Polygons: ${this.polygons.length}`);
    this.polygons.forEach(polygon => {
      if (polygon && this.mapProvider) {
        const mapInstance = this.mapProvider.getMapInstance();
        if (this.config.visible) {
          if (this.mapProvider.getName() === 'google') {
            polygon.setMap(mapInstance);
          } else if (this.mapProvider.getName() === 'kakao') {
            polygon.setMap(mapInstance);
          } else if (this.mapProvider.getName() === 'naver') {
            polygon.setMap(mapInstance);
          }
        } else {
          if (this.mapProvider.getName() === 'google') {
            polygon.setMap(null);
          } else if (this.mapProvider.getName() === 'kakao') {
            polygon.setMap(null);
          } else if (this.mapProvider.getName() === 'naver') {
            polygon.setMap(null);
          }
        }
      }
    });
  }
  
  private updateOpacity(): void {
    this.polygons.forEach(polygon => {
      if (polygon) {
        const providerName = this.mapProvider?.getName();
        if (providerName === 'google') {
          polygon.setOptions({
            strokeOpacity: this.config.opacity,
            fillOpacity: this.config.opacity * 0.2
          });
        } else if (providerName === 'kakao') {
          polygon.setOptions({
            strokeOpacity: this.config.opacity,
            fillOpacity: this.config.opacity * 0.2
          });
        } else if (providerName === 'naver') {
          polygon.setOptions({
            strokeOpacity: this.config.opacity,
            fillOpacity: this.config.opacity * 0.2
          });
        }
      }
    });
  }
  
  private updateZIndex(): void {
    this.polygons.forEach(polygon => {
      if (polygon) {
        const providerName = this.mapProvider?.getName();
        if (providerName === 'google') {
          polygon.setOptions({ zIndex: this.config.zIndex });
        } else if (providerName === 'kakao') {
          polygon.setOptions({ zIndex: this.config.zIndex });
        } else if (providerName === 'naver') {
          polygon.setOptions({ zIndex: this.config.zIndex });
        }
      }
    });
  }
  
  cleanup(): void {
    this.polygons.forEach(polygon => {
      try {
        if (polygon) {
          const providerName = this.mapProvider?.getName();
          if (providerName === 'google') {
            polygon.setMap(null);
          } else if (providerName === 'kakao') {
            polygon.setMap(null);
          } else if (providerName === 'naver') {
            polygon.setMap(null);
          }
        }
      } catch (e) {
        // 이미 제거된 경우 무시
      }
    });
    this.polygons = [];
    this.mapProvider = null;
  }
}
