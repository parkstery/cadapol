// layers/AdministrativeBoundaryLayer.tsx

import { LayerConfig, LayerType } from '../../types';
import { Layer, MapProvider } from '../map-providers/BaseMapProvider';
import { VWorldAPI, AdministrativeBoundary } from '../utils/vworldApi';
import proj4 from 'proj4';

export class AdministrativeBoundaryLayer implements Layer {
  private config: LayerConfig;
  private mapProvider: MapProvider | null = null;
  private polygons: any[] = [];
  private level: 'sido' | 'sigungu' | 'emd';
  
  constructor(config: LayerConfig) {
    this.config = config;
    this.level = (config.options?.level as 'sido' | 'sigungu' | 'emd') || 'sido';
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
  
  async attachToMap(mapProvider: MapProvider): Promise<void> {
    this.mapProvider = mapProvider;
    const mapInstance = mapProvider.getMapInstance();
    
    if (!mapInstance) {
      throw new Error('Map instance not available');
    }
    
    try {
      // 지도 경계 가져오기 (항상 현재 보이는 영역만 조회)
      const bounds = this.getMapBounds(mapInstance, mapProvider.getName());
      
      if (!bounds) {
        console.warn('AdministrativeBoundaryLayer: Cannot get map bounds');
        return;
      }
      
      // VWorld API로 행정경계 데이터 조회 (현재 보이는 영역만)
      const boundaries = await VWorldAPI.getAdministrativeBoundaries(this.level, bounds);
      
      // 맵 제공자별로 폴리곤 생성
      this.polygons = boundaries.map(boundary => {
        return this.createPolygon(boundary, mapProvider);
      });
      
      if (this.config.visible) {
        this.updateVisibility();
      }
    } catch (error) {
      console.error('AdministrativeBoundaryLayer: Failed to load boundaries', error);
    }
  }
  
  detachFromMap(): void {
    this.hide();
    this.mapProvider = null;
  }
  
  private getMapBounds(mapInstance: any, providerName: string): { minLat: number; minLng: number; maxLat: number; maxLng: number } | undefined {
    try {
      if (providerName === 'google') {
        const bounds = mapInstance.getBounds();
        if (bounds) {
          const ne = bounds.getNorthEast();
          const sw = bounds.getSouthWest();
          return {
            minLat: sw.lat(),
            minLng: sw.lng(),
            maxLat: ne.lat(),
            maxLng: ne.lng()
          };
        }
      } else if (providerName === 'kakao') {
        const bounds = mapInstance.getBounds();
        if (bounds) {
          return {
            minLat: bounds.getSouthWest().getLat(),
            minLng: bounds.getSouthWest().getLng(),
            maxLat: bounds.getNorthEast().getLat(),
            maxLng: bounds.getNorthEast().getLng()
          };
        }
      } else if (providerName === 'naver') {
        const bounds = mapInstance.getBounds();
        if (bounds) {
          return {
            minLat: bounds.getSW().lat(),
            minLng: bounds.getSW().lng(),
            maxLat: bounds.getNE().lat(),
            maxLng: bounds.getNE().lng()
          };
        }
      }
    } catch (error) {
      console.warn('Failed to get map bounds', error);
    }
    return undefined;
  }
  
  private createPolygon(boundary: AdministrativeBoundary, mapProvider: MapProvider): any {
    const mapInstance = mapProvider.getMapInstance();
    const providerName = mapProvider.getName();
    
    try {
      const paths = this.parseGeometry(boundary.geometry);
      
      if (paths.length === 0) return null;
      
      if (providerName === 'google') {
        return new window.google.maps.Polygon({
          paths: paths.map(p => ({ lat: p[1], lng: p[0] })),
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
        return new window.kakao.maps.Polygon({
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
      } else if (providerName === 'naver') {
        const naverPaths = paths.map(p => new window.naver.maps.LatLng(p[1], p[0]));
        return new window.naver.maps.Polygon({
          paths: naverPaths,
          strokeColor: '#4285F4',
          strokeOpacity: this.config.opacity,
          strokeWeight: 2,
          fillColor: '#4285F4',
          fillOpacity: this.config.opacity * 0.2,
          map: this.config.visible ? mapInstance : null,
          zIndex: this.config.zIndex
        });
      }
    } catch (error) {
      console.error('Failed to create polygon', error);
      return null;
    }
    
    return null;
  }
  
  private parseGeometry(geometry: any): number[][] {
    if (!geometry || !geometry.coordinates) return [];
    
    try {
      if (geometry.type === 'Polygon') {
        // Polygon의 첫 번째 ring (외곽 경계)만 사용
        const outerRing = geometry.coordinates[0];
        if (!outerRing || outerRing.length === 0) return [];
        
        const firstPoint = outerRing[0];
        let isTM = firstPoint[0] > 180 || firstPoint[1] > 90; // EPSG:5179 감지
        
        if (isTM && proj4) {
          try {
            proj4.defs("EPSG:5179", "+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs");
            const proj = proj4("EPSG:5179", "EPSG:4326");
            return outerRing.map((coord: number[]) => {
              const [lon, lat] = proj.forward([coord[0], coord[1]]);
              return [lon, lat];
            });
          } catch (e) {
            console.error("Proj4 conversion error", e);
            return [];
          }
        } else {
          return outerRing.map((coord: number[]) => [coord[0], coord[1]]);
        }
      } else if (geometry.type === 'MultiPolygon') {
        // MultiPolygon의 경우 첫 번째 Polygon만 사용
        if (geometry.coordinates && geometry.coordinates.length > 0) {
          return this.parseGeometry({ type: 'Polygon', coordinates: geometry.coordinates[0] });
        }
      }
    } catch (e) {
      console.error("Geometry parsing error", e);
    }
    
    return [];
  }
  
  private updateVisibility(): void {
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
