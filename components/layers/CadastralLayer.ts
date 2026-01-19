// layers/CadastralLayer.ts

import { Layer } from '../map-providers/BaseMapProvider';
import { LayerType } from '../../types';
import proj4 from 'proj4';

// VWorld API 설정
const VWORLD_KEY = '04FADF88-BBB0-3A72-8404-479547569E44';
const ALLOWED_DOMAIN = 'https://cadapol.vercel.app/';

/**
 * 지적 레이어 구현
 * VWorld API를 사용하여 지적 정보를 조회하고 표시합니다.
 */
export class CadastralLayer implements Layer {
  private id: string;
  private name: string;
  private visible: boolean = false;
  private opacity: number = 1.0;
  private zIndex: number = 20;
  private mapProvider: any = null;
  private mapInstance: any = null;

  // 지적 정보 관련 리소스
  private cadastralPolygon: any = null;
  private cadastralOverlay: any = null;
  private cadastralClickPos: any = null;
  private cadastralPNU: string | null = null;

  constructor(id?: string, name: string = '지적 경계') {
    this.id = id || `cadastral-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    this.name = name;
  }

  getId(): string {
    return this.id;
  }

  getType(): LayerType {
    return LayerType.CADASTRAL;
  }

  getName(): string {
    return this.name;
  }

  show(): void {
    this.visible = true;
    // 레이어가 이미 표시된 경우에는 아무것도 하지 않음
    // 실제 표시는 사용자가 지도를 클릭할 때 fetchCadastralInfo가 호출됨
  }

  hide(): void {
    this.visible = false;
    this.clearGraphics();
  }

  isVisible(): boolean {
    return this.visible;
  }

  setOpacity(opacity: number): void {
    this.opacity = Math.max(0, Math.min(1, opacity));
    // 폴리곤 투명도 업데이트
    if (this.cadastralPolygon) {
      try {
        if (this.mapInstance && window.kakao) {
          // Kakao Maps의 경우
          this.cadastralPolygon.setOptions({
            fillOpacity: this.opacity * 0.2,
            strokeOpacity: this.opacity
          });
        }
      } catch (error) {
        console.error('Failed to update polygon opacity:', error);
      }
    }
  }

  getOpacity(): number {
    return this.opacity;
  }

  setZIndex(zIndex: number): void {
    this.zIndex = zIndex;
    // 폴리곤 Z-index는 맵 제공자에 따라 다르게 처리됨
  }

  getZIndex(): number {
    return this.zIndex;
  }

  async attachToMap(mapProvider: any): Promise<void> {
    this.mapProvider = mapProvider;
    this.mapInstance = mapProvider.getMapInstance();
    
    if (!this.mapInstance) {
      throw new Error('Map instance not available');
    }

    // Kakao Maps에서만 지적 레이어 지원
    if (!window.kakao) {
      console.warn('CadastralLayer: Kakao Maps SDK not loaded');
      return;
    }

    // 지도 클릭 이벤트 리스너 설정
    this.setupMapClickListener();
  }

  detachFromMap(): void {
    this.clearGraphics();
    this.mapProvider = null;
    this.mapInstance = null;
  }

  cleanup(): void {
    this.clearGraphics();
    this.detachFromMap();
  }

  /**
   * 지도 클릭 이벤트 리스너 설정
   */
  private setupMapClickListener(): void {
    if (!this.mapInstance || !window.kakao) {
      return;
    }

    // 기존 리스너 제거 (중복 방지)
    if ((this.mapInstance as any).__cadastralClickListener) {
      window.kakao.maps.event.removeListener(
        this.mapInstance,
        'click',
        (this.mapInstance as any).__cadastralClickListener
      );
    }

    const onClick = (e: any) => {
      if (!this.visible) {
        return;
      }

      const pos = e.latLng;
      this.cadastralClickPos = pos;
      
      // 기존 그래픽 제거
      this.clearGraphics();

      // 주소 조회 및 InfoWindow 표시
      this.fetchAddressAndShowInfoWindow(pos);

      // 지적 정보 조회 시작
      this.fetchCadastralInfo(pos.getLng(), pos.getLat());
    };

    window.kakao.maps.event.addListener(this.mapInstance, 'click', onClick);
    (this.mapInstance as any).__cadastralClickListener = onClick;
  }

  /**
   * 주소 조회 및 InfoWindow 표시
   */
  private fetchAddressAndShowInfoWindow(pos: any): void {
    if (!this.mapInstance || !window.kakao || !window.kakao.maps.services) {
      return;
    }

    const geocoder = new window.kakao.maps.services.Geocoder();
    
    geocoder.coord2Address(pos.getLng(), pos.getLat(), (result: any, status: any) => {
      if (status === window.kakao.maps.services.Status.OK) {
        const roadAddr = result[0].road_address ? result[0].road_address.address_name : '';
        const jibunAddr = result[0].address ? result[0].address.address_name : '';
        const mainAddr = roadAddr || jibunAddr;
        
        const lat = pos.getLat();
        const lng = pos.getLng();
        
        // InfoWindow 생성
        this.createInfoWindow(lat, lng, mainAddr);
      } else {
        // 주소 조회 실패 시에도 InfoWindow 생성 (좌표만 표시)
        const lat = pos.getLat();
        const lng = pos.getLng();
        this.createInfoWindow(lat, lng, '');
      }
    });
  }

  /**
   * 지적 정보 조회 (1단계: 좌표로 PNU 조회)
   */
  private fetchCadastralInfo(lng: number, lat: number): void {
    if (!VWORLD_KEY) {
      console.warn('VWorld API key is missing');
      return;
    }

    const callbackName = `vworld_step1_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    
    (window as any)[callbackName] = (data: any) => {
      delete (window as any)[callbackName];
      document.getElementById(callbackName)?.remove();

      if (data.response && data.response.status === 'OK' && 
          data.response.result.featureCollection.features.length > 0) {
        const feature = data.response.result.featureCollection.features[0];
        const pnu = feature.properties.pnu;
        
        console.log('Step1: PNU retrieved', pnu);
        
        this.cadastralPNU = pnu;
        
        // InfoWindow에 PNU 정보 추가
        this.updateInfoWindowPNU(pnu);
        
        // 2단계: PNU로 폴리곤 조회
        if (pnu) {
          this.fetchGeometryByPNU(pnu);
        }
      } else {
        console.warn('Step1: No features found or API error', data.response);
      }
    };

    const script = document.createElement('script');
    script.id = callbackName;
    script.src = `https://api.vworld.kr/req/data?service=data&request=GetFeature&data=LP_PA_CBND_BUBUN&key=${VWORLD_KEY}&geomFilter=POINT(${lng} ${lat})&domain=${encodeURIComponent(ALLOWED_DOMAIN)}&crs=EPSG:4326&format=json&errorFormat=json&geometry=false&callback=${callbackName}`;
    script.onerror = () => {
      console.error('Step1: Script load error');
      delete (window as any)[callbackName];
      document.getElementById(callbackName)?.remove();
    };
    document.body.appendChild(script);
  }

  /**
   * 지적 정보 조회 (2단계: PNU로 폴리곤 Geometry 조회)
   */
  private fetchGeometryByPNU(pnu: string): void {
    const callbackName = `vworld_step2_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    
    (window as any)[callbackName] = (data: any) => {
      delete (window as any)[callbackName];
      document.getElementById(callbackName)?.remove();

      if (data.response && data.response.status === 'OK' && 
          data.response.result.featureCollection.features.length > 0) {
        const feature = data.response.result.features[0];
        if (feature.geometry) {
          console.log('Step2: Geometry retrieved', feature.geometry.type);
          this.drawParcelPolygon(feature.geometry);
        }
      } else {
        console.warn('Step2: No features found or API error', data.response);
      }
    };

    const script = document.createElement('script');
    script.id = callbackName;
    script.src = `https://api.vworld.kr/req/data?service=data&request=GetFeature&data=LP_PA_CBND_BUBUN&key=${VWORLD_KEY}&attrFilter=pnu:=:${pnu}&domain=${encodeURIComponent(ALLOWED_DOMAIN)}&crs=EPSG:4326&format=json&errorFormat=json&geometry=true&callback=${callbackName}`;
    script.onerror = () => {
      console.error('Step2: Script load error');
      delete (window as any)[callbackName];
      document.getElementById(callbackName)?.remove();
    };
    document.body.appendChild(script);
  }

  /**
   * 지적 경계 폴리곤 그리기
   */
  private drawParcelPolygon(geometry: any): void {
    if (!this.mapInstance || !window.kakao || !geometry) {
      console.warn('drawParcelPolygon: Missing required parameters');
      return;
    }

    let paths: any[] = [];
    
    // Proj4를 이용한 좌표계 변환 및 파싱
    const parsePolygon = (coordinates: any[]) => {
      if (!coordinates || coordinates.length === 0) return [];
      
      const outerRing = coordinates[0];
      if (!outerRing || outerRing.length === 0) return [];
      
      const firstPoint = outerRing[0];
      const isTM = firstPoint[0] > 180 || firstPoint[1] > 90; // EPSG:5179 감지

      if (isTM) {
        try {
          if (proj4) {
            proj4.defs('EPSG:5179', '+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs');
            const proj = proj4('EPSG:5179', 'EPSG:4326');
            return outerRing.map((coord: number[]) => {
              const [lon, lat] = proj.forward([coord[0], coord[1]]);
              return new window.kakao.maps.LatLng(lat, lon);
            });
          }
          return [];
        } catch (e) {
          console.error('Proj4 conversion error', e);
          return [];
        }
      } else {
        return outerRing.map((coord: number[]) => 
          new window.kakao.maps.LatLng(coord[1], coord[0])
        );
      }
    };

    try {
      if (geometry.type === 'Polygon') {
        paths = parsePolygon(geometry.coordinates);
      } else if (geometry.type === 'MultiPolygon') {
        if (geometry.coordinates && geometry.coordinates.length > 0) {
          paths = parsePolygon(geometry.coordinates[0]);
        }
      } else {
        console.warn('drawParcelPolygon: Unsupported geometry type', geometry.type);
        return;
      }
    } catch (e) {
      console.error('Geometry parsing error', e);
      return;
    }

    if (paths.length > 0) {
      try {
        const polygon = new window.kakao.maps.Polygon({
          path: paths,
          strokeWeight: 3,
          strokeColor: '#f97316', // Orange-500
          strokeOpacity: this.opacity,
          strokeStyle: 'solid',
          fillColor: '#f97316',
          fillOpacity: this.opacity * 0.2
        });
        polygon.setMap(this.mapInstance);
        this.cadastralPolygon = polygon;
        console.log('Cadastral polygon drawn successfully', paths.length, 'points');
        
        // InfoWindow 위치 업데이트
        this.updateInfoWindowPosition();
      } catch (e) {
        console.error('Failed to create polygon', e);
      }
    }
  }

  /**
   * InfoWindow 생성/업데이트
   */
  private createInfoWindow(lat: number, lng: number, address: string): void {
    if (!this.mapInstance || !window.kakao) {
      return;
    }

    // 기존 InfoWindow 제거
    if (this.cadastralOverlay) {
      this.cadastralOverlay.setMap(null);
    }

    const contentDiv = document.createElement('div');
    contentDiv.style.cssText = `
      padding: 12px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      min-width: 200px;
      font-size: 13px;
      line-height: 1.5;
    `;

    const latStr = lat.toFixed(7);
    const lngStr = lng.toFixed(7);

    contentDiv.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 6px; color: #1e293b;">지적 정보</div>
      <div style="margin-top: 8px; font-size: 12px; color: #64748b;">
        <div style="display:flex; justify-content:space-between; margin-bottom: 4px;">
          <span>위도</span> <span style="font-family: monospace;">${latStr}</span>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom: 4px;">
          <span>경도</span> <span style="font-family: monospace;">${lngStr}</span>
        </div>
        ${address ? `<div style="margin-top: 6px; padding-top: 6px; border-top: 1px dashed rgba(0,0,0,0.15);">${address}</div>` : ''}
        <div id="cadastral-pnu-section" style="margin-top: 6px; padding-top: 6px; border-top: 1px dashed rgba(0,0,0,0.15); font-size: 11px; color: #64748b; display: none;"></div>
      </div>
    `;

    const position = new window.kakao.maps.LatLng(lat, lng);
    this.cadastralOverlay = new window.kakao.maps.CustomOverlay({
      position: position,
      content: contentDiv,
      yAnchor: 1,
      xAnchor: 0.5
    });

    this.cadastralOverlay.setMap(this.mapInstance);
  }

  /**
   * InfoWindow에 PNU 정보 업데이트
   */
  private updateInfoWindowPNU(pnu: string): void {
    if (!this.cadastralOverlay || !pnu) {
      return;
    }

    const contentDiv = this.cadastralOverlay.getContent();
    if (contentDiv) {
      let pnuSection = contentDiv.querySelector('#cadastral-pnu-section') as HTMLElement;
      if (!pnuSection) {
        pnuSection = document.createElement('div');
        pnuSection.id = 'cadastral-pnu-section';
        pnuSection.style.cssText = 'margin-top: 6px; padding-top: 6px; border-top: 1px dashed rgba(0,0,0,0.15); font-size: 11px; color: #64748b;';
        contentDiv.appendChild(pnuSection);
      }
      
      pnuSection.style.display = 'block';
      pnuSection.innerHTML = `<div style="display:flex; justify-content:space-between;"><span>PNU</span> <span style="font-family: monospace; font-weight:600;">${pnu}</span></div>`;
    }
  }

  /**
   * InfoWindow 위치 업데이트 (폴리곤 생성 후)
   */
  private updateInfoWindowPosition(): void {
    if (!this.cadastralOverlay || !this.cadastralClickPos || !this.mapInstance) {
      return;
    }

    const clickLat = this.cadastralClickPos.getLat();
    const clickLng = this.cadastralClickPos.getLng();
    
    const zoomLevel = this.mapInstance.getLevel();
    const baseOffset = 0.0001;
    const zoomFactor = Math.pow(2, Math.max(0, zoomLevel - 3));
    const latOffset = baseOffset / zoomFactor;
    
    const infoWindowLat = clickLat + latOffset;
    const infoWindowPos = new window.kakao.maps.LatLng(infoWindowLat, clickLng);
    
    this.cadastralOverlay.setPosition(infoWindowPos);
  }

  /**
   * 그래픽 리소스 정리
   */
  private clearGraphics(): void {
    if (this.cadastralPolygon) {
      this.cadastralPolygon.setMap(null);
      this.cadastralPolygon = null;
    }
    if (this.cadastralOverlay) {
      this.cadastralOverlay.setMap(null);
      this.cadastralOverlay = null;
    }
    this.cadastralClickPos = null;
    this.cadastralPNU = null;
  }
}
