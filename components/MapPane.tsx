import React, { useEffect, useRef, useState, useCallback } from 'react';
import { MapVendor, MapState, PaneConfig, GISMode } from '../types';
import KakaoGisToolbar from './KakaoGisToolbar';
import proj4 from 'proj4';
// 🆕 새 Provider 시스템 (점진적 마이그레이션)
import { MapProviderFactory } from './map-providers/MapProviderFactory';
import { MapProvider } from './map-providers/BaseMapProvider';
import { GoogleMapProvider } from './map-providers/GoogleMapProvider';
import { KakaoMapProvider } from './map-providers/KakaoMapProvider';
import { NaverMapProvider } from './map-providers/NaverMapProvider';
// 🆕 GIS 도구
import { DistanceMeasure } from './gis-tools/DistanceMeasure';
import { AreaMeasure } from './gis-tools/AreaMeasure';
// 🆕 레이어 시스템
import { LayerManager } from './layers/LayerManager';
import { LayerType } from '../types';
import { createDefaultLayerConfig } from './layers/BaseLayer';
// 🆕 길찾기 시스템
import { RoutingManager } from './routing/RoutingManager';
import { RoutingPanel } from './RoutingPanel';

// VWorld API 설정
const VWORLD_KEY = '04FADF88-BBB0-3A72-8404-479547569E44';
// VWorld API는 도메인 제한이 있으므로 reference 코드와 동일한 도메인 사용
const ALLOWED_DOMAIN = 'https://cadapol.vercel.app/';

interface MapPaneProps {
  side: 'left' | 'right';
  config: PaneConfig;
  globalState: MapState;
  onStateChange: (state: MapState) => void;
  searchPos: { lat: number, lng: number } | null;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  streetViewState: { lat: number, lng: number, active: boolean } | null;
  onStreetViewChange: (state: { lat: number, lng: number, active: boolean } | null) => void;
}

const MapPane: React.FC<MapPaneProps> = ({ 
  side, config, globalState, onStateChange, searchPos, 
  isFullscreen, onToggleFullscreen, streetViewState, onStreetViewChange
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  
  // 🆕 새 Provider 시스템 (점진적 마이그레이션)
  const mapProviderRef = useRef<MapProvider | null>(null);
  const useNewProvider = config.type === 'google' || config.type === 'kakao' || config.type === 'naver'; // 모든 맵 새 Provider 사용 (점진적 마이그레이션)
  
  // -- Sync Control Refs --
  const isDragging = useRef(false); 
  const isProgrammaticUpdate = useRef(false);
  const isCadastralCloseClick = useRef(false); // 지적 infowindow 닫기 버튼 클릭 플래그

  const [sdkLoaded, setSdkLoaded] = useState(false); 
  
  // -- Street View / Road View States --
  const [isStreetViewActive, setIsStreetViewActive] = useState(false);

  // Google Refs
  const googlePanoRef = useRef<HTMLDivElement>(null);
  const googlePanoInstanceRef = useRef<any>(null);
  const googleCoverageLayerRef = useRef<any>(null);

  // Naver Refs
  const naverStreetLayerRef = useRef<any>(null);
  const naverPanoramaRef = useRef<any>(null);
  const naverPanoContainerRef = useRef<HTMLDivElement>(null);
  const naverMarkerRef = useRef<any>(null); // Marker on Mini-map
  const naverDirectionPolygonRef = useRef<any>(null); // 방향 표시 폴리곤 (원뿔형)
  const naverMarkerIconUrlRef = useRef<string | null>(null); // 마커 아이콘 URL (메모리 정리용)
  const naverMarkerIconUrlCacheRef = useRef<Map<number, string>>(new Map()); // 각도별 blob URL 캐시
  const naverPolygonStateRef = useRef<{ pos: any; angle: number } | null>(null); // 폴리곤 재생성을 위한 상태 저장
  const [isNaverLayerOn, setIsNaverLayerOn] = useState(false);
  
  // Kakao Refs & Drawing State
  const kakaoGisRef = useRef<{
    rv: any;
    rvClient: any;
    geocoder: any;
    walker: any;
    roadviewLayer: boolean;
    clickHandler?: any; 
    addressClickListener?: any;
    walkerOverlay?: any; // Walker on Mini-map
    directionPolygon?: any; // 방향 표시 폴리곤 (원뿔형)
    polygonState?: { pos: any; angle: number } | null; // 폴리곤 재생성을 위한 상태 저장
    cadastralMarker?: any; // 지적 정보 조회 시 표시할 마커
    cadastralPolygon?: any; // 지적 경계 폴리곤
    cadastralOverlay?: any; // 지적 정보 인포윈도우
    cadastralClickPos?: any; // 지적 정보 클릭 위치
    cadastralPNU?: string; // 지적 정보 PNU
  }>({
    rv: null,
    rvClient: null,
    geocoder: null,
    walker: null,
    roadviewLayer: false
  });
  
  // Kakao Drawing Refs for Measurement
  const kakaoDrawingRef = useRef<{
    polylines: any[];
    polygons: any[];
    overlays: any[];
    listeners: (() => void)[];
  }>({
    polylines: [], polygons: [], overlays: [], listeners: []
  });

  const [gisMode, setGisMode] = useState<GISMode>(GISMode.DEFAULT);
  const roadviewRef = useRef<HTMLDivElement>(null);
  
  // 🆕 레이어 관리자
  const layerManagerRef = useRef<LayerManager>(new LayerManager());
  
  // 🆕 길찾기 관리자
  const routingManagerRef = useRef<RoutingManager>(new RoutingManager());
  const [isRoutingPanelOpen, setIsRoutingPanelOpen] = useState(false);

  // Helper: Zoom conversion
  const zoomToKakao = (z: number) => Math.max(1, Math.min(14, 20 - z));
  const kakaoToZoom = (l: number) => Math.max(3, Math.min(20, 20 - l));

  // 1. SDK Loading Check & Init
  useEffect(() => {
    let intervalId: any = null;
    const checkAndInit = () => {
      // 1. Google - 🆕 새 Provider 시스템 사용
      if (config.type === 'google' && window.google && window.google.maps) {
        if (containerRef.current) {
          containerRef.current.innerHTML = '';
          
          // 기존 Provider 정리
          if (mapProviderRef.current) {
            mapProviderRef.current.cleanup();
            mapProviderRef.current = null;
          }
          
          // 새 Provider 생성 및 초기화
          try {
            const provider = MapProviderFactory.create('google');
            provider.init({
              container: containerRef.current,
              initialState: globalState,
              isSatellite: config.isSatellite,
              onStateChange: onStateChange,
              // 🆕 거리뷰 컨테이너 전달
              panoContainer: googlePanoRef.current || undefined,
            }).then(async () => {
              mapProviderRef.current = provider;
              mapRef.current = provider.getMapInstance(); // 기존 코드 호환성
              
              // 🆕 레이어 관리자 및 길찾기 관리자에 맵 제공자 설정
              await layerManagerRef.current.setMapProvider(provider);
              routingManagerRef.current.setMapProvider(provider);
              
              // 🆕 거리뷰 관련 ref 설정 (기존 코드 호환성)
              if (provider instanceof GoogleMapProvider) {
                googlePanoInstanceRef.current = provider.getPanoramaInstance();
                googleCoverageLayerRef.current = provider.getCoverageLayer();
                
                // 거리뷰 이벤트 리스너 설정
                const panorama = provider.getPanoramaInstance();
                if (panorama) {
                  panorama.addListener('visible_changed', () => {
                    const isVisible = panorama.getVisible();
                    setIsStreetViewActive(isVisible);
                    if (isVisible) {
                      // 거리뷰 컨테이너 표시 보장
                      if (googlePanoRef.current) {
                        googlePanoRef.current.style.display = 'block';
                      }
                      const coverageLayer = provider.getCoverageLayer();
                      if (coverageLayer && mapRef.current) {
                        coverageLayer.setMap(mapRef.current);
                      }
                      // 거리뷰 시작 시 초기 위치를 미니맵 중앙으로 이동
                      const pos = panorama.getPosition();
                      if (pos && mapRef.current) {
                        const lat = pos.lat();
                        const lng = pos.lng();
                        // 좌표 유효성 검증
                        if (typeof lat === 'number' && typeof lng === 'number' && 
                            !isNaN(lat) && !isNaN(lng) && 
                            isFinite(lat) && isFinite(lng)) {
                          mapRef.current.setCenter({ lat, lng });
                          onStateChange({ lat, lng, zoom: mapRef.current.getZoom() });
                          // 거리뷰 상태 업데이트 (동기화를 위해)
                          onStreetViewChange({ lat, lng, active: true });
                        } else {
                          console.warn('Google Street View: 유효하지 않은 좌표', { lat, lng });
                        }
                      }
                    } else {
                      // 거리뷰 컨테이너 숨김
                      if (googlePanoRef.current) {
                        googlePanoRef.current.style.display = 'none';
                      }
                      const coverageLayer = provider.getCoverageLayer();
                      if (coverageLayer) {
                        coverageLayer.setMap(null);
                      }
                      // 거리뷰 닫을 때 상태 업데이트
                      onStreetViewChange(null);
                    }
                  });

                  panorama.addListener('position_changed', () => {
                    if (panorama.getVisible()) {
                      const pos = panorama.getPosition();
                      if (pos && mapRef.current) {
                        const lat = pos.lat();
                        const lng = pos.lng();
                        // 좌표 유효성 검증
                        if (typeof lat === 'number' && typeof lng === 'number' && 
                            !isNaN(lat) && !isNaN(lng) && 
                            isFinite(lat) && isFinite(lng)) {
                          isDragging.current = true; 
                          
                          // 거리뷰 상태 업데이트 (동기화를 위해)
                          onStreetViewChange({ lat, lng, active: true });
                          
                          // 미니맵 중앙으로 이동
                          mapRef.current.setCenter({ lat, lng });
                          onStateChange({ lat, lng, zoom: mapRef.current.getZoom() });
                          
                          setTimeout(() => isDragging.current = false, 200);
                        } else {
                          console.warn('Google Street View: 유효하지 않은 좌표 (position_changed)', { lat, lng });
                        }
                      }
                    }
                  });
                }
              }
              
              setupMapListeners('google');
              
              setSdkLoaded(true);
            }).catch((error) => {
              console.error('GoogleMapProvider initialization failed:', error);
              setSdkLoaded(false);
            });
          } catch (error) {
            console.error('GoogleMapProvider creation failed:', error);
            setSdkLoaded(false);
          }
        }
        return true;
      }
      // 2. Kakao - 🆕 새 Provider 시스템 사용
      if (config.type === 'kakao' && window.kakao) {
        try {
          // window.kakao.maps.load가 준비되었는지 확인
          if (window.kakao.maps && typeof window.kakao.maps.load === 'function') {
            if (containerRef.current) {
              // 기존 Provider 정리 (컨테이너 비우기 전에)
              if (mapProviderRef.current) {
                try {
                  mapProviderRef.current.cleanup();
                } catch (error) {
                  console.warn('KakaoMapProvider cleanup error:', error);
                }
                mapProviderRef.current = null;
              }
              
              // 카카오맵 리소스 추가 정리
              clearKakaoDrawingResources();
              if (kakaoGisRef.current.walkerOverlay) {
                try {
                  kakaoGisRef.current.walkerOverlay.setMap(null);
                } catch (e) {}
                kakaoGisRef.current.walkerOverlay = null;
              }
              if (kakaoGisRef.current.directionPolygon) {
                try {
                  kakaoGisRef.current.directionPolygon.setMap(null);
                } catch (e) {}
                kakaoGisRef.current.directionPolygon = null;
              }
              if (kakaoGisRef.current.rv) {
                try {
                  kakaoGisRef.current.rv = null;
                } catch (e) {}
              }
              kakaoGisRef.current.geocoder = null;
              kakaoGisRef.current.rvClient = null;
              kakaoGisRef.current.roadviewLayer = false;
              
              // 컨테이너 비우기
              containerRef.current.innerHTML = '';
              
              // 새 Provider 생성 및 초기화
              window.kakao.maps.load(async () => {
                try {
                  const provider = MapProviderFactory.create('kakao');
                  await provider.init({
                    container: containerRef.current!,
                    initialState: globalState,
                    isSatellite: config.isSatellite,
                    onStateChange: onStateChange,
                  });
                  
                  mapProviderRef.current = provider;
                  mapRef.current = provider.getMapInstance(); // 기존 코드 호환성
                  
                  // 🆕 레이어 관리자 및 길찾기 관리자에 맵 제공자 설정
                  await layerManagerRef.current.setMapProvider(provider);
                  routingManagerRef.current.setMapProvider(provider);
                  
                  // 기존 GIS 기능 초기화 (지적 정보 조회 등)
                  // 새 Provider의 Geocoder를 기존 ref에 설정 (호환성)
                  if (provider instanceof KakaoMapProvider) {
                    kakaoGisRef.current.geocoder = provider.getGeocoder();
                    kakaoGisRef.current.rvClient = provider.getRoadviewClient();
                  }
                  setupKakaoAddressClick();
                  
                  setSdkLoaded(true);
                } catch (error) {
                  console.error('KakaoMapProvider initialization failed:', error);
                  setSdkLoaded(false);
                }
              });
            }
            return true;
          }
          // maps.load가 아직 준비되지 않았으면 false 반환하여 재시도
          return false;
        } catch (error) {
          console.error('Kakao Maps SDK 로딩 오류:', error);
          return false;
        }
      }
      // 3. Naver - 🆕 새 Provider 시스템 사용
      if (config.type === 'naver' && window.naver && window.naver.maps) {
        if (containerRef.current) {
          containerRef.current.innerHTML = '';
          
          // 기존 Provider 정리
          if (mapProviderRef.current) {
            mapProviderRef.current.cleanup();
            mapProviderRef.current = null;
          }
          
          // 새 Provider 생성 및 초기화
          try {
            const provider = MapProviderFactory.create('naver');
            provider.init({
              container: containerRef.current,
              initialState: globalState,
              isSatellite: config.isSatellite,
              onStateChange: onStateChange,
            }).then(async () => {
              mapProviderRef.current = provider;
              mapRef.current = provider.getMapInstance(); // 기존 코드 호환성
              
              // 🆕 레이어 관리자 및 길찾기 관리자에 맵 제공자 설정
              await layerManagerRef.current.setMapProvider(provider);
              routingManagerRef.current.setMapProvider(provider);
              
              // 기존 GIS 기능 초기화 (거리뷰 레이어 등)
              if (provider instanceof NaverMapProvider) {
                naverStreetLayerRef.current = provider.getStreetLayer();
              }
              
              setupMapListeners('naver');
              
              setSdkLoaded(true);
            }).catch((error) => {
              console.error('NaverMapProvider initialization failed:', error);
              setSdkLoaded(false);
            });
          } catch (error) {
            console.error('NaverMapProvider creation failed:', error);
            setSdkLoaded(false);
          }
        }
        return true;
      }
      return false;
    };

    if (!checkAndInit()) {
      intervalId = setInterval(() => {
        if (checkAndInit()) {
          clearInterval(intervalId);
          // Kakao의 경우 load() 콜백에서 setSdkLoaded를 호출하므로 여기서는 호출하지 않음
          if (config.type !== 'kakao') {
            setSdkLoaded(true);
          }
        }
      }, 300);
    } else {
      // Kakao의 경우 load() 콜백에서 setSdkLoaded를 호출하므로 여기서는 호출하지 않음
      if (config.type !== 'kakao') {
        setSdkLoaded(true);
      }
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.type]);

  // ** Reset Refs on Config Change **
  useEffect(() => {
    isDragging.current = false;
    isProgrammaticUpdate.current = false;
    setIsNaverLayerOn(false); 
    setGisMode(GISMode.DEFAULT);
    setIsStreetViewActive(false);
    
    // 🆕 새 Provider 정리
    if (mapProviderRef.current) {
      mapProviderRef.current.cleanup();
      mapProviderRef.current = null;
    }
    
    // 🆕 레이어 관리자 및 길찾기 관리자 정리
    layerManagerRef.current.setMapProvider(null);
    routingManagerRef.current.setMapProvider(null);
    
    // Clear Naver Resources
    if (config.type !== 'naver') {
        if (naverPanoramaRef.current) naverPanoramaRef.current = null;
        if (naverMarkerRef.current) { naverMarkerRef.current.setMap(null); naverMarkerRef.current = null; }
        if (naverDirectionPolygonRef.current) { naverDirectionPolygonRef.current.setMap(null); naverDirectionPolygonRef.current = null; }
        // blob URL 캐시 정리 (마커가 완전히 제거된 후에만 revoke)
        if (naverMarkerIconUrlCacheRef.current) {
          naverMarkerIconUrlCacheRef.current.forEach((url) => {
            try {
              URL.revokeObjectURL(url);
            } catch (e) {
              // 이미 revoke된 경우 무시
            }
          });
          naverMarkerIconUrlCacheRef.current.clear();
        }
        if (naverMarkerIconUrlRef.current) { 
          naverMarkerIconUrlRef.current = null; 
        }
        if (naverPanoContainerRef.current) naverPanoContainerRef.current.innerHTML = '';
        if (naverStreetLayerRef.current) naverStreetLayerRef.current = null;
    }
    // Clear Google Resources
    if (config.type !== 'google') {
       if (googleCoverageLayerRef.current) googleCoverageLayerRef.current.setMap(null);
    }
    // Clear Kakao Resources
    if (config.type !== 'kakao') {
      // 카카오맵 리소스 정리 (순서 중요)
      try {
        // 먼저 이벤트 리스너 정리
        if (kakaoGisRef.current.addressClickListener && mapRef.current) {
          try {
            window.kakao.maps.event.removeListener(mapRef.current, 'click', kakaoGisRef.current.addressClickListener);
          } catch (e) {
            // 이미 제거된 경우 무시
          }
          kakaoGisRef.current.addressClickListener = null;
        }
        
        // 오버레이 및 폴리곤 정리
        if (kakaoGisRef.current.walkerOverlay) {
          try {
            kakaoGisRef.current.walkerOverlay.setMap(null);
          } catch (e) {}
          kakaoGisRef.current.walkerOverlay = null;
        }
        if (kakaoGisRef.current.directionPolygon) {
          try {
            kakaoGisRef.current.directionPolygon.setMap(null);
          } catch (e) {}
          kakaoGisRef.current.directionPolygon = null;
        }
        if (kakaoGisRef.current.cadastralOverlay) {
          try {
            kakaoGisRef.current.cadastralOverlay.setMap(null);
          } catch (e) {}
          kakaoGisRef.current.cadastralOverlay = null;
        }
        
        // 그리기 리소스 정리
        clearKakaoDrawingResources();
        
        // 기타 리소스 정리
        if (kakaoGisRef.current.rv) {
          try {
            kakaoGisRef.current.rv = null;
          } catch (e) {}
        }
        kakaoGisRef.current.geocoder = null;
        kakaoGisRef.current.rvClient = null;
        kakaoGisRef.current.roadviewLayer = false;
      } catch (e) {
        console.warn('Kakao resources cleanup error:', e);
      }
    }
  }, [config.type]);


  // -- Resize & Refresh Handler --
  useEffect(() => {
    if (!mapRef.current) return;
    
    const timer = setTimeout(() => {
      try {
        if (config.type === 'google') {
          window.google.maps.event.trigger(mapRef.current, 'resize');
          mapRef.current.setCenter({ lat: globalState.lat, lng: globalState.lng });
        } else if (config.type === 'kakao') {
          // 카카오맵 리사이즈 처리 (미니맵 전환 시 중요)
          mapRef.current.relayout();
          mapRef.current.setCenter(new window.kakao.maps.LatLng(globalState.lat, globalState.lng));
          
          // 거리뷰 활성화 시 Walker 재표시
          if (isStreetViewActive && kakaoGisRef.current.walkerOverlay) {
            setTimeout(() => {
              if (kakaoGisRef.current.walkerOverlay && mapRef.current) {
                kakaoGisRef.current.walkerOverlay.setMap(null);
                kakaoGisRef.current.walkerOverlay.setMap(mapRef.current);
              }
            }, 100);
          }
        } else if (config.type === 'naver') {
          window.naver.maps.Event.trigger(mapRef.current, 'resize');
          mapRef.current.setCenter(new window.naver.maps.LatLng(globalState.lat, globalState.lng));
          
          // 네이버 파노라마 리사이즈 처리
          if (isStreetViewActive && naverPanoramaRef.current) {
            setTimeout(() => {
              if (naverPanoramaRef.current) {
                window.naver.maps.Event.trigger(naverPanoramaRef.current, 'resize');
              }
            }, 100);
          }
        }
      } catch(e) { console.error(e); }
    }, 350); 
    
    return () => clearTimeout(timer);
  }, [isStreetViewActive, config.type, globalState.lat, globalState.lng]);

  // -- 미니맵 위치 재확인 (맵 API 스타일 오버라이드 방지) --
  useEffect(() => {
    if (isStreetViewActive && containerRef.current) {
      // 즉시 설정
      const setPosition = () => {
        if (containerRef.current) {
          // 인라인 스타일로 위치 강제 설정 (맵 API 스타일 오버라이드 방지)
          // 직접 style 속성에 할당하여 최고 우선순위 보장
          const element = containerRef.current;
          element.style.position = 'absolute';
          element.style.bottom = '12px';
          element.style.left = '12px';
          element.style.top = 'auto';
          element.style.right = 'auto';
          // CSS 변수로도 설정 (추가 보장)
          element.style.setProperty('--minimap-bottom', '12px', '');
          element.style.setProperty('--minimap-left', '12px', '');
        }
      };
      
      // 즉시 실행
      setPosition();
      
      // 여러 시점에서 재설정 (맵 API가 스타일을 변경할 수 있으므로)
      const timers = [
        setTimeout(setPosition, 50),
        setTimeout(setPosition, 100),
        setTimeout(setPosition, 200),
        setTimeout(setPosition, 350),  // 트랜지션 완료 후
        setTimeout(setPosition, 500),  // 추가 확인
        setTimeout(setPosition, 1000)   // 최종 확인
      ];
      
      // MutationObserver로 스타일 변경 감지
      let observer: MutationObserver | null = null;
      if (containerRef.current) {
        observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && 
                (mutation.attributeName === 'style' || mutation.attributeName === 'class')) {
              // 스타일이나 클래스가 변경되면 다시 설정
              setTimeout(setPosition, 10);
            }
          });
        });
        
        observer.observe(containerRef.current, {
          attributes: true,
          attributeFilter: ['style', 'class']
        });
      }
      
      return () => {
        timers.forEach(timer => clearTimeout(timer));
        if (observer) {
          observer.disconnect();
        }
      };
    }
  }, [isStreetViewActive]);


  // 2. Initialize Maps
  // 🆕 기존 init 함수들은 Provider 시스템으로 완전 전환되어 제거됨
  // 모든 맵 초기화는 MapProviderFactory를 통해 처리됨

  // 카카오맵 방향 표시 폴리곤 생성 (부채 모양)
  const createKakaoDirectionPolygon = useCallback((centerPos: any, angle: number, map: any) => {
    // 기존 폴리곤 제거
    if (kakaoGisRef.current.directionPolygon) {
      kakaoGisRef.current.directionPolygon.setMap(null);
      kakaoGisRef.current.directionPolygon = null;
    }

    if (!map) return;

    // 부채꼴 폴리곤 파라미터 (픽셀 단위로 일정한 크기 유지)
    const fanRadiusPixels = 50; // 약 50픽셀 (구글 pegman처럼 일정한 크기)
    const fanAngle = 60; // 부채 각도 (도)
    const fanHalfAngle = fanAngle / 2; // 부채 반각
    const numPoints = 20; // 호를 그리기 위한 점의 개수

    // 중심점 좌표
    const centerLat = centerPos.getLat();
    const centerLng = centerPos.getLng();

    // 지도 레벨에 따라 픽셀을 미터로 변환
    const level = map.getLevel();
    // 카카오맵 레벨을 줌 레벨로 변환
    const zoom = kakaoToZoom(level);
    // 줌 레벨에 따른 미터/픽셀 비율 계산 (대략적인 공식)
    // 줌 레벨이 높을수록(확대할수록) 1픽셀당 미터가 작아짐
    const metersPerPixel = (156543.03392 * Math.cos(centerLat * Math.PI / 180)) / Math.pow(2, zoom);
    const fanRadiusMeters = fanRadiusPixels * metersPerPixel;

    // 미터를 위도/경도로 변환 (지구 곡률 고려)
    const latToMeters = 111320; // 1도 위도 ≈ 111,320m
    const lngToMeters = 111320 * Math.cos(centerLat * Math.PI / 180); // 경도는 위도에 따라 다름
    const fanRadiusLat = fanRadiusMeters / latToMeters;
    const fanRadiusLng = fanRadiusMeters / lngToMeters;

    // 방향 각도를 라디안으로 변환 (카카오맵은 시계방향, 북쪽이 0도)
    const angleRad = (angle * Math.PI) / 180;

    // 부채꼴 경로 생성
    const path = [centerPos]; // 중심점에서 시작

    // 시작 각도와 끝 각도 계산
    const startAngleRad = angleRad - (fanHalfAngle * Math.PI) / 180;
    const endAngleRad = angleRad + (fanHalfAngle * Math.PI) / 180;

    // 호를 따라 점들을 생성 (끝점에서 중심점 방향으로)
    for (let i = numPoints; i >= 0; i--) {
      const t = i / numPoints;
      const currentAngleRad = startAngleRad + (endAngleRad - startAngleRad) * t;
      
      const pointLat = centerLat + fanRadiusLat * Math.cos(currentAngleRad);
      const pointLng = centerLng + fanRadiusLng * Math.sin(currentAngleRad);
      path.push(new window.kakao.maps.LatLng(pointLat, pointLng));
    }

    // 폴리곤 생성
    kakaoGisRef.current.directionPolygon = new window.kakao.maps.Polygon({
      map: map,
      path: path,
      strokeWeight: 0,
      strokeColor: '#e24a4a',
      strokeOpacity: 0,
      fillColor: '#e24a4a',
      fillOpacity: 0.3, // 반투명 빨간색
      zIndex: 999 // walker 아래에 표시
    });
    
    // 폴리곤 재생성을 위한 상태 저장
    kakaoGisRef.current.polygonState = { pos: centerPos, angle };
  }, []);

  // 카카오맵 Walker 생성 헬퍼 함수 (카카오맵 공식 walker 사용, 방향 동기화)
  const createKakaoWalker = useCallback((pos: any, map: any, angle?: number) => {
    // 기존 Walker가 있으면 완전히 제거 (중복 방지)
    if (kakaoGisRef.current.walkerOverlay) {
      try {
        kakaoGisRef.current.walkerOverlay.setMap(null);
      } catch (e) {
        // 이미 제거된 경우 무시
      }
      kakaoGisRef.current.walkerOverlay = null;
    }
    
    // walker 생성 플래그 (중복 방지)
    let walkerCreated = false;
    
    // walker 생성 헬퍼 함수 (중복 방지)
    const createWalkerOverlay = (content: HTMLDivElement) => {
      // 이미 생성되었으면 무시
      if (walkerCreated || kakaoGisRef.current.walkerOverlay) {
        return;
      }
      
      walkerCreated = true;
      kakaoGisRef.current.walkerOverlay = new window.kakao.maps.CustomOverlay({
        position: pos,
        content: content,
        map: map,
        yAnchor: 0.5, // 중심 기준으로 앵커 설정 (PanoID point에 일치)
        zIndex: 1000
      });
      
      // 방향 표시 폴리곤 생성
      if (angle !== undefined && map) {
        createKakaoDirectionPolygon(pos, angle, map);
      }
      
      // 지도 리사이즈 후 Walker 재표시 보장 (중복 방지)
      setTimeout(() => {
        // walker가 여전히 존재하고 같은 인스턴스인지 확인
        if (kakaoGisRef.current.walkerOverlay && map) {
          try {
            // walker의 실제 position을 가져와서 폴리곤과 동기화
            const walkerPos = kakaoGisRef.current.walkerOverlay.getPosition();
            if (walkerPos) {
              // 폴리곤만 재생성하여 동기화 보장
              if (angle !== undefined) {
                createKakaoDirectionPolygon(walkerPos, angle, map);
              }
            }
          } catch (e) {
            // walker가 이미 제거된 경우 무시
            console.warn('Walker 재표시 중 오류:', e);
          }
        } else if (kakaoGisRef.current.directionPolygon && map && angle !== undefined) {
          // walker가 없어도 폴리곤은 재표시
          kakaoGisRef.current.directionPolygon.setMap(null);
          createKakaoDirectionPolygon(pos, angle, map);
        }
      }, 150);
    };
    
    // SVG로 walker 직접 생성 (이미지 로딩 실패 방지)
    const size = 24;
    const svg = `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <path d="M12,2 L22,20 L2,20 Z" fill="#FF3333" stroke="#FFFFFF" stroke-width="2"/>
      </svg>
    `;
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    
    const content = document.createElement('div');
    content.style.width = `${size}px`;
    content.style.height = `${size}px`;
    content.style.backgroundImage = `url(${url})`;
    content.style.backgroundSize = 'contain';
    content.style.backgroundPosition = 'center';
    content.style.backgroundRepeat = 'no-repeat';
    content.style.transformOrigin = 'center center'; // 회전 중심을 중앙으로 설정 (방향 비추기)
    if (angle !== undefined) {
      content.style.transform = `rotate(${angle}deg)`;
    }
    
    // walker 생성
    createWalkerOverlay(content);
  }, [createKakaoDirectionPolygon]);

  // 네이버맵 방향 표시 폴리곤 생성 (부채 모양)
  const createNaverDirectionPolygon = useCallback((centerPos: any, angle: number, map: any) => {
    // 기존 폴리곤 제거
    if (naverDirectionPolygonRef.current) {
      naverDirectionPolygonRef.current.setMap(null);
      naverDirectionPolygonRef.current = null;
    }

    if (!map) return;

    // 부채꼴 폴리곤 파라미터 (픽셀 단위로 일정한 크기 유지)
    const fanRadiusPixels = 50; // 약 50픽셀 (구글 pegman처럼 일정한 크기)
    const fanAngle = 60; // 부채 각도 (도)
    const fanHalfAngle = fanAngle / 2; // 부채 반각
    const numPoints = 20; // 호를 그리기 위한 점의 개수

    // 중심점 좌표
    const centerLat = centerPos.lat();
    const centerLng = centerPos.lng();

    // 지도 줌 레벨에 따라 픽셀을 미터로 변환
    const zoom = map.getZoom();
    // 줌 레벨에 따른 미터/픽셀 비율 계산 (대략적인 공식)
    // 줌 레벨이 높을수록(확대할수록) 1픽셀당 미터가 작아짐
    const metersPerPixel = (156543.03392 * Math.cos(centerLat * Math.PI / 180)) / Math.pow(2, zoom);
    const fanRadiusMeters = fanRadiusPixels * metersPerPixel;

    // 미터를 위도/경도로 변환 (지구 곡률 고려)
    const latToMeters = 111320; // 1도 위도 ≈ 111,320m
    const lngToMeters = 111320 * Math.cos(centerLat * Math.PI / 180); // 경도는 위도에 따라 다름
    const fanRadiusLat = fanRadiusMeters / latToMeters;
    const fanRadiusLng = fanRadiusMeters / lngToMeters;

    // 방향 각도를 라디안으로 변환 (네이버맵은 시계방향, 북쪽이 0도)
    const angleRad = (angle * Math.PI) / 180;

    // 부채꼴 경로 생성
    const path = [centerPos]; // 중심점에서 시작

    // 시작 각도와 끝 각도 계산
    const startAngleRad = angleRad - (fanHalfAngle * Math.PI) / 180;
    const endAngleRad = angleRad + (fanHalfAngle * Math.PI) / 180;

    // 호를 따라 점들을 생성 (끝점에서 중심점 방향으로)
    for (let i = numPoints; i >= 0; i--) {
      const t = i / numPoints;
      const currentAngleRad = startAngleRad + (endAngleRad - startAngleRad) * t;
      
      const pointLat = centerLat + fanRadiusLat * Math.cos(currentAngleRad);
      const pointLng = centerLng + fanRadiusLng * Math.sin(currentAngleRad);
      path.push(new window.naver.maps.LatLng(pointLat, pointLng));
    }

    // 폴리곤 생성
    naverDirectionPolygonRef.current = new window.naver.maps.Polygon({
      map: map,
      paths: path,
      strokeWeight: 0,
      strokeColor: '#e24a4a',
      strokeOpacity: 0,
      fillColor: '#e24a4a',
      fillOpacity: 0.3, // 반투명 빨간색 (카카오맵과 동일)
      zIndex: 999 // marker 아래에 표시
    });
    
    // 폴리곤 재생성을 위한 상태 저장
    naverPolygonStateRef.current = { pos: centerPos, angle };
  }, []);

  // 네이버맵 삼각형 마커 생성 헬퍼 함수
  const createNaverTriangleMarker = useCallback((angle: number = 0) => {
    // 각도를 정수로 반올림하여 캐시 키로 사용 (0.1도 단위 차이는 무시)
    const angleKey = Math.round(angle);
    
    // 캐시에 해당 각도의 blob URL이 있으면 재사용
    if (naverMarkerIconUrlCacheRef.current.has(angleKey)) {
      const cachedUrl = naverMarkerIconUrlCacheRef.current.get(angleKey);
      if (cachedUrl) {
        naverMarkerIconUrlRef.current = cachedUrl;
        return {
          url: cachedUrl,
          size: new window.naver.maps.Size(24, 24),
          anchor: new window.naver.maps.Point(12, 12), // 중심 기준 (PanoID point에 일치)
          scaledSize: new window.naver.maps.Size(24, 24)
        };
      }
    }
    
    // 캐시에 없으면 새로 생성
    const size = 24;
    // 네이버맵 각도: 북쪽 0도, 시계방향 증가 (-180 ~ 180 범위)
    // SVG는 기본적으로 위쪽(북쪽)을 향하므로, 각도를 그대로 적용
    const svg = `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <g transform="rotate(${angle} ${size/2} ${size/2})">
          <path d="M12,2 L22,20 L2,20 Z" fill="#FF3333" stroke="#FFFFFF" stroke-width="2"/>
        </g>
      </svg>
    `;
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    
    // 캐시에 저장 (최대 10개까지만 유지하여 메모리 관리)
    if (naverMarkerIconUrlCacheRef.current.size >= 10) {
      // 가장 오래된 항목 제거 (FIFO)
      const firstKey = naverMarkerIconUrlCacheRef.current.keys().next().value;
      const oldUrl = naverMarkerIconUrlCacheRef.current.get(firstKey);
      if (oldUrl) {
        URL.revokeObjectURL(oldUrl);
      }
      naverMarkerIconUrlCacheRef.current.delete(firstKey);
    }
    
    naverMarkerIconUrlCacheRef.current.set(angleKey, url);
    naverMarkerIconUrlRef.current = url; // URL 저장 (나중에 정리용)
    
    return {
      url: url,
      size: new window.naver.maps.Size(size, size),
      anchor: new window.naver.maps.Point(size / 2, size / 2), // 중심 기준 (PanoID point에 일치)
      scaledSize: new window.naver.maps.Size(size, size)
    };
  }, []);

  const initNaverPanorama = (container: HTMLDivElement, latlng: any, map: any) => {
    try {
      // 기존 파노라마의 이벤트 리스너 제거 (중복 방지)
      if (naverPanoramaRef.current) {
        window.naver.maps.Event.clearInstanceListeners(naverPanoramaRef.current);
      }
      
      // setCenter 호출 debounce를 위한 타이머
      let centerUpdateTimer: any = null;
      let lastCenterPos: any = null;
      
      // 컨테이너 스타일 확인 및 조정 (전체 영역 채우기 보장)
      if (container) {
        container.style.position = 'absolute';
        container.style.top = '0';
        container.style.left = '0';
        container.style.right = '0';
        container.style.bottom = '0';
        container.style.width = '100%';
        container.style.height = '100%';
        container.style.margin = '0';
        container.style.padding = '0';
        container.style.boxSizing = 'border-box';
      }
      
      const pano = new window.naver.maps.Panorama(container, {
        position: latlng,
        pov: { pan: -135, tilt: 29, fov: 100 },
        visible: true
      });
      naverPanoramaRef.current = pano;

      // 파노라마 로드 완료 이벤트
      window.naver.maps.Event.addListener(pano, 'init', () => {
        console.log('Naver Panorama 초기화 완료');
        // 파노라마가 실제로 로드된 위치로 마커 업데이트
        const actualPos = pano.getPosition();
        const pov = pano.getPov();
        const angle = pov ? pov.pan : 0;
        
        if (mapRef.current) {
          mapRef.current.setCenter(actualPos);
          
          // setCenter 후 마커 위치를 즉시 업데이트 (비동기 처리 보완)
          requestAnimationFrame(() => {
            if (!mapRef.current) return;
            
            const currentPos = pano.getPosition();
            if (currentPos && naverMarkerRef.current) {
              naverMarkerRef.current.setPosition(currentPos);
              naverMarkerRef.current.setMap(mapRef.current);
            }
          });
        }
        
        if (naverMarkerRef.current) {
          naverMarkerRef.current.setPosition(actualPos);
          naverMarkerRef.current.setIcon(createNaverTriangleMarker(angle));
          if (typeof naverMarkerRef.current.setAngle === 'function') {
            naverMarkerRef.current.setAngle(angle);
          }
          naverMarkerRef.current.setMap(mapRef.current);
        }
        
        // 방향 표시 폴리곤 업데이트
        if (mapRef.current) {
          createNaverDirectionPolygon(actualPos, angle, mapRef.current);
        }
        
        // 파노라마 초기화 후 리사이즈 이벤트 트리거 (렌더링 보장)
        // 컨테이너 크기가 확실히 설정된 후 리사이즈
        setTimeout(() => {
          if (container && container.offsetWidth > 0 && container.offsetHeight > 0) {
            window.naver.maps.Event.trigger(pano, 'resize');
            // 추가로 한 번 더 리사이즈 (렌더링 보장)
            setTimeout(() => {
              window.naver.maps.Event.trigger(pano, 'resize');
            }, 50);
          }
        }, 150);
      });

      // 파노라마 로드 실패 이벤트
      window.naver.maps.Event.addListener(pano, 'error', (error: any) => {
        console.error('Naver Panorama 로드 오류:', error);
        // 파노라마가 없는 위치일 수 있으므로 거리뷰 닫기
        setIsStreetViewActive(false);
      });

      // setCenter 호출을 debounce하는 함수
      const debouncedSetCenter = (pos: any) => {
        if (!pos || !mapRef.current) return;
        
        // 현재 중심과 비교하여 불필요한 호출 방지
        const currentCenter = mapRef.current.getCenter();
        if (currentCenter && lastCenterPos) {
          const latDiff = Math.abs(currentCenter.lat() - pos.lat());
          const lngDiff = Math.abs(currentCenter.lng() - pos.lng());
          // 위치 차이가 매우 작으면 (같은 위치) 무시
          if (latDiff < 0.00001 && lngDiff < 0.00001) {
            return;
          }
        }
        
        // 이전 타이머 취소
        if (centerUpdateTimer) {
          clearTimeout(centerUpdateTimer);
        }
        
        // 마지막 위치 저장
        lastCenterPos = pos;
        
        // debounce: 100ms 후에만 setCenter 호출
        centerUpdateTimer = setTimeout(() => {
          if (mapRef.current && pos) {
            mapRef.current.setCenter(pos);
          }
          centerUpdateTimer = null;
        }, 100);
      };

      // 파노라마 변경 이벤트 (화살표 클릭으로 이동할 때 발생) - pano_changed가 가장 확실함
      window.naver.maps.Event.addListener(pano, 'pano_changed', () => {
        // 파노라마가 변경되면 즉시 위치 정보를 가져와서 마커 업데이트
        const updateMarkerFromPano = () => {
          // getLocation() 또는 getPosition() 사용하여 위치 정보 가져오기
          let pos = null;
          try {
            // getLocation()이 있으면 사용 (더 정확한 위치 정보)
            if (typeof pano.getLocation === 'function') {
              const location = pano.getLocation();
              if (location && location.coord) {
                pos = location.coord;
              }
            }
            // getLocation()이 없거나 실패하면 getPosition() 사용
            if (!pos) {
              pos = pano.getPosition();
            }
          } catch (e) {
            // getLocation() 실패 시 getPosition() 사용
            pos = pano.getPosition();
          }
          
          if (!pos || !mapRef.current) return;
          
          const pov = pano.getPov();
          const angle = pov ? pov.pan : 0;
          
          // Sync Map Center - 미니맵 중앙으로 이동 (debounce 처리)
          debouncedSetCenter(pos);
          
          // Sync Marker - 즉시 업데이트
          if (naverMarkerRef.current) {
            naverMarkerRef.current.setPosition(pos);
            naverMarkerRef.current.setIcon(createNaverTriangleMarker(angle));
            if (typeof naverMarkerRef.current.setAngle === 'function') {
              naverMarkerRef.current.setAngle(angle);
            }
            naverMarkerRef.current.setMap(mapRef.current);
          } else {
            const icon = createNaverTriangleMarker(angle);
            naverMarkerRef.current = new window.naver.maps.Marker({
              position: pos,
              map: mapRef.current,
              icon: icon,
              angle: angle
            });
          }
          
          // 방향 표시 폴리곤 업데이트
          createNaverDirectionPolygon(pos, angle, mapRef.current);
          
          // 거리뷰 상태 업데이트 (동기화를 위해)
          onStreetViewChange({ lat: pos.lat(), lng: pos.lng(), active: true });
        };
        
        // 즉시 업데이트 시도
        updateMarkerFromPano();
        
        // 파노라마 위치 정보가 아직 업데이트되지 않았을 수 있으므로 짧은 딜레이 후 재시도
        setTimeout(updateMarkerFromPano, 100);
        setTimeout(updateMarkerFromPano, 200);
      });

      // 파노라마 링크 변경 이벤트 (클릭으로 이동할 때 발생) - 보조 이벤트
      // pano_changed 이벤트가 이미 처리하므로 여기서는 마커만 업데이트 (setCenter는 제외)
      window.naver.maps.Event.addListener(pano, 'links_changed', () => {
        // 링크 변경 후 위치가 변경될 수 있으므로 짧은 딜레이 후 마커 업데이트
        setTimeout(() => {
          const pos = pano.getPosition();
          if (pos && mapRef.current) {
            const pov = pano.getPov();
            const angle = pov ? pov.pan : 0;
            
            // Sync Marker - 즉시 업데이트 (setCenter는 pano_changed에서 처리)
            if (naverMarkerRef.current) {
              naverMarkerRef.current.setPosition(pos);
              naverMarkerRef.current.setIcon(createNaverTriangleMarker(angle));
              if (typeof naverMarkerRef.current.setAngle === 'function') {
                naverMarkerRef.current.setAngle(angle);
              }
              naverMarkerRef.current.setMap(mapRef.current);
            } else {
              const icon = createNaverTriangleMarker(angle);
              naverMarkerRef.current = new window.naver.maps.Marker({
                position: pos,
                map: mapRef.current,
                icon: icon,
                angle: angle
              });
            }
            
            // 방향 표시 폴리곤 업데이트
            createNaverDirectionPolygon(pos, angle, mapRef.current);
          }
        }, 150);
      });

      // Sync Map & Marker when Panorama moves - 미니맵 중앙으로 이동
      const positionChangedListener = () => {
        const pos = pano.getPosition();
        if (!pos) return;
        
        const lat = pos.lat();
        const lng = pos.lng();
        const pov = pano.getPov();
        const angle = pov ? pov.pan : 0;
        
        // 거리뷰 상태 업데이트 (동기화를 위해)
        onStreetViewChange({ lat, lng, active: true });
        
        // Sync Map Center - 미니맵 중앙으로 이동 (debounce 처리)
        debouncedSetCenter(pos);
        
        // Sync Marker - 미니맵 중앙에 위치 (삼각형 마커, 방향 동기화)
        // 즉시 업데이트 (비동기 처리 보완)
        if (naverMarkerRef.current && mapRef.current) {
          // 마커 위치를 중앙으로 업데이트
          naverMarkerRef.current.setPosition(pos);
          // 방향 동기화: 거리뷰 방향에 따라 마커 회전
          naverMarkerRef.current.setIcon(createNaverTriangleMarker(angle));
          if (typeof naverMarkerRef.current.setAngle === 'function') {
            naverMarkerRef.current.setAngle(angle);
          }
          // 마커가 지도에 표시되도록 보장
          naverMarkerRef.current.setMap(mapRef.current);
        } else if (mapRef.current) {
          // 마커가 없으면 생성 (삼각형 마커, 방향 포함)
          const icon = createNaverTriangleMarker(angle);
          naverMarkerRef.current = new window.naver.maps.Marker({
            position: pos,
            map: mapRef.current,
            icon: icon,
            angle: angle
          });
        }
        
        // 방향 표시 폴리곤 생성/업데이트
        if (mapRef.current) {
          createNaverDirectionPolygon(pos, angle, mapRef.current);
        }
        
        // setCenter 후 marker를 미니맵 중앙에 유지 (비동기 처리 보완)
        requestAnimationFrame(() => {
          if (mapRef.current && naverMarkerRef.current) {
            const currentCenter = mapRef.current.getCenter();
            if (currentCenter) {
              // marker 위치를 지도 중심으로 다시 설정
              naverMarkerRef.current.setPosition(currentCenter);
              // 지도 중심도 다시 설정 (이중 보장)
              mapRef.current.setCenter(pos);
            }
          }
        });
      };
      
      window.naver.maps.Event.addListener(pano, 'position_changed', positionChangedListener);

      // 파노라마 시점 변경 이벤트 (방향 업데이트 및 동기화)
      window.naver.maps.Event.addListener(pano, 'pov_changed', () => {
        const pov = pano.getPov();
        const angle = pov ? pov.pan : 0;
        const pos = pano.getPosition();
        
        // Sync Map Center - 미니맵 중앙으로 이동 (debounce 처리, pov_changed는 방향만 변경되므로 setCenter는 최소화)
        if (mapRef.current && pos) {
          // 방향 변경만 있는 경우 setCenter는 호출하지 않음 (이미 중앙에 있으므로)
          // 하지만 위치가 변경된 경우에만 setCenter 호출
          const currentCenter = mapRef.current.getCenter();
          if (currentCenter) {
            const latDiff = Math.abs(currentCenter.lat() - pos.lat());
            const lngDiff = Math.abs(currentCenter.lng() - pos.lng());
            // 위치 차이가 있는 경우에만 setCenter 호출
            if (latDiff > 0.00001 || lngDiff > 0.00001) {
              debouncedSetCenter(pos);
            }
          }
        }
        
        if (naverMarkerRef.current && mapRef.current && pos) {
          // 새로운 아이콘 생성 (각도 반영)
          const newIcon = createNaverTriangleMarker(angle);
          
          // 마커 아이콘 업데이트 (방향 반영)
          // setIcon이 즉시 반영되지 않을 수 있으므로, 마커를 지도에서 제거 후 다시 추가
          naverMarkerRef.current.setMap(null);
          naverMarkerRef.current.setIcon(newIcon);
          naverMarkerRef.current.setPosition(pos);
          naverMarkerRef.current.setMap(mapRef.current);
        }
        
        // 방향 표시 폴리곤 업데이트
        if (pos && mapRef.current) {
          createNaverDirectionPolygon(pos, angle, mapRef.current);
        }
        
        // setCenter 후 marker를 미니맵 중앙에 유지 (비동기 처리 보완)
        requestAnimationFrame(() => {
          if (mapRef.current && naverMarkerRef.current && pos) {
            const currentCenter = mapRef.current.getCenter();
            if (currentCenter) {
              // marker 위치를 지도 중심으로 다시 설정
              naverMarkerRef.current.setPosition(currentCenter);
            }
          }
        });
      });
    } catch (error) {
      console.error('Naver Panorama 생성 오류:', error);
      setIsStreetViewActive(false);
    }
  };

  // 3. Common Map Listeners
  const setupMapListeners = (type: MapVendor) => {
    if (!mapRef.current) return;

    const shouldUpdate = (newLat: number, newLng: number, newZoom: number) => {
        if (isProgrammaticUpdate.current) return false;
        const latDiff = Math.abs(newLat - globalState.lat);
        const lngDiff = Math.abs(newLng - globalState.lng);
        if (latDiff < 0.00001 && lngDiff < 0.00001 && newZoom === globalState.zoom) {
            return false;
        }
        return true;
    };

    if (type === 'google') {
      mapRef.current.addListener('dragstart', () => { isDragging.current = true; });
      mapRef.current.addListener('dragend', () => { isDragging.current = false; });
      const handleUpdate = () => {
        const c = mapRef.current.getCenter();
        const z = mapRef.current.getZoom();
        if (shouldUpdate(c.lat(), c.lng(), z)) {
            onStateChange({ lat: c.lat(), lng: c.lng(), zoom: z });
        }
      };
      mapRef.current.addListener('center_changed', handleUpdate);
      mapRef.current.addListener('zoom_changed', handleUpdate);

    } else if (type === 'kakao') {
      window.kakao.maps.event.addListener(mapRef.current, 'dragstart', () => { isDragging.current = true; });
      window.kakao.maps.event.addListener(mapRef.current, 'dragend', () => { isDragging.current = false; });
      const handleUpdate = () => {
        if (!mapRef.current || typeof mapRef.current.getCenter !== 'function' || typeof mapRef.current.getLevel !== 'function') {
          return;
        }
        try {
          const c = mapRef.current.getCenter();
          const level = mapRef.current.getLevel();
          const z = kakaoToZoom(level);
          if (shouldUpdate(c.getLat(), c.getLng(), z)) {
              onStateChange({ lat: c.getLat(), lng: c.getLng(), zoom: z });
          }
        } catch (error) {
          console.error('Kakao Map update error:', error);
        }
      };
      window.kakao.maps.event.addListener(mapRef.current, 'center_changed', handleUpdate);
      window.kakao.maps.event.addListener(mapRef.current, 'zoom_changed', () => {
        handleUpdate();
        // 지도 줌 변경 시 폴리곤 재생성 (일정한 픽셀 크기 유지)
        // 로드뷰가 활성화되어 있을 때만 폴리곤 재생성
        if (isStreetViewActive && kakaoGisRef.current.polygonState && mapRef.current) {
          const { pos, angle } = kakaoGisRef.current.polygonState;
          createKakaoDirectionPolygon(pos, angle, mapRef.current);
        }
      });

    } else if (type === 'naver') {
      window.naver.maps.Event.addListener(mapRef.current, 'dragstart', () => { isDragging.current = true; });
      window.naver.maps.Event.addListener(mapRef.current, 'dragend', () => { isDragging.current = false; });
      const handleUpdate = () => {
        if (isProgrammaticUpdate.current) return;
        const c = mapRef.current.getCenter();
        const z = mapRef.current.getZoom();
        if (shouldUpdate(c.lat(), c.lng(), z)) {
            onStateChange({ lat: c.lat(), lng: c.lng(), zoom: z });
        }
      };
      window.naver.maps.Event.addListener(mapRef.current, 'center_changed', handleUpdate);
      window.naver.maps.Event.addListener(mapRef.current, 'zoom_changed', () => {
        handleUpdate();
        // 지도 줌 변경 시 폴리곤 재생성 (일정한 픽셀 크기 유지)
        if (naverPolygonStateRef.current && mapRef.current) {
          const { pos, angle } = naverPolygonStateRef.current;
          createNaverDirectionPolygon(pos, angle, mapRef.current);
        }
      });
    }
  };

  // 지적 경계 폴리곤 관련 그래픽 제거
  const clearCadastralGraphics = () => {
    if (kakaoGisRef.current.cadastralMarker) {
      kakaoGisRef.current.cadastralMarker.setMap(null);
      kakaoGisRef.current.cadastralMarker = null;
    }
    if (kakaoGisRef.current.cadastralPolygon) {
      kakaoGisRef.current.cadastralPolygon.setMap(null);
      kakaoGisRef.current.cadastralPolygon = null;
    }
    if (kakaoGisRef.current.cadastralOverlay) {
      kakaoGisRef.current.cadastralOverlay.setMap(null);
      kakaoGisRef.current.cadastralOverlay = null;
    }
  };

  // [1단계] 좌표로 PNU 조회
  const fetchCadastralInfoStep1 = (lng: number, lat: number, currentMap: any) => {
    if (!VWORLD_KEY) {
      console.warn("VWorld API key is missing");
      return;
    }

    const callbackName = `vworld_step1_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    
    (window as any)[callbackName] = (data: any) => {
      delete (window as any)[callbackName];
      document.getElementById(callbackName)?.remove();

      if (data.response && data.response.status === 'OK' && data.response.result.featureCollection.features.length > 0) {
        const feature = data.response.result.featureCollection.features[0];
        const pnu = feature.properties.pnu;
        
        console.log("Step1: PNU retrieved", pnu);
        
        // PNU 정보 저장 (infowindow 업데이트용)
        kakaoGisRef.current.cadastralPNU = pnu;
        
        // infowindow에 PNU 정보 추가
        if (kakaoGisRef.current.cadastralOverlay && pnu) {
          const contentDiv = kakaoGisRef.current.cadastralOverlay.getContent();
          if (contentDiv) {
            // PNU 섹션 찾기 또는 생성
            let pnuSection = contentDiv.querySelector('#cadastral-pnu-section');
            if (!pnuSection) {
              // PNU 섹션이 없으면 생성
              pnuSection = document.createElement('div');
              pnuSection.id = 'cadastral-pnu-section';
              pnuSection.style.cssText = 'margin-top: 6px; padding-top: 6px; border-top: 1px dashed rgba(0,0,0,0.15); font-size: 11px; color: #64748b;';
              
              // 좌표 정보 섹션 뒤에 삽입
              const coordSection = contentDiv.querySelector('div[style*="margin-top: 8px"]');
              if (coordSection && coordSection.parentNode) {
                coordSection.parentNode.insertBefore(pnuSection, coordSection.nextSibling);
              }
            }
            
            // PNU 정보 업데이트
            pnuSection.innerHTML = `<div style="display:flex; justify-content:space-between;"><span>PNU</span> <span style="font-family: monospace; font-weight:600;">${pnu}</span></div>`;
          }
        }
        
        // 2단계: PNU로 폴리곤 조회 호출
        if (pnu) {
          fetchGeometryByPNUStep2(pnu, currentMap);
        } else {
          console.warn("Step1: PNU is empty");
        }
      } else {
        console.warn("Step1: No features found or API error", data.response);
      }
    };

    const script = document.createElement('script');
    script.id = callbackName;
    const domain = ALLOWED_DOMAIN || 'https://cadapol.vercel.app/';
    script.src = `https://api.vworld.kr/req/data?service=data&version=2.0&request=GetFeature&data=LP_PA_CBND_BUBUN&key=${VWORLD_KEY}&geomFilter=POINT(${lng} ${lat})&domain=${encodeURIComponent(domain)}&crs=EPSG:4326&format=json&errorFormat=json&geometry=false&callback=${callbackName}`;
    script.onerror = () => {
      console.error("Step1: Script load error");
      delete (window as any)[callbackName];
      document.getElementById(callbackName)?.remove();
    };
    document.body.appendChild(script);
  };

  // [2단계] PNU로 정확한 폴리곤 Geometry 조회 및 그리기
  const fetchGeometryByPNUStep2 = (pnu: string, currentMap: any) => {
    const callbackName = `vworld_step2_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    
    (window as any)[callbackName] = (data: any) => {
      delete (window as any)[callbackName];
      document.getElementById(callbackName)?.remove();

      if (data.response && data.response.status === 'OK' && data.response.result.featureCollection.features.length > 0) {
        const feature = data.response.result.featureCollection.features[0];
        if (feature.geometry) {
          console.log("Step2: Geometry retrieved", feature.geometry.type);
          drawParcelPolygon(feature.geometry, currentMap);
        } else {
          console.warn("Step2: No geometry in feature");
        }
      } else {
        console.warn("Step2: No features found or API error", data.response);
      }
    };

    const script = document.createElement('script');
    script.id = callbackName;
    const domain = ALLOWED_DOMAIN || 'https://cadapol.vercel.app/';
    script.src = `https://api.vworld.kr/req/data?service=data&version=2.0&request=GetFeature&data=LP_PA_CBND_BUBUN&key=${VWORLD_KEY}&attrFilter=pnu:=:${pnu}&domain=${encodeURIComponent(domain)}&crs=EPSG:4326&format=json&errorFormat=json&geometry=true&callback=${callbackName}`;
    script.onerror = () => {
      console.error("Step2: Script load error");
      delete (window as any)[callbackName];
      document.getElementById(callbackName)?.remove();
    };
    document.body.appendChild(script);
  };

  // 지적 경계 폴리곤 그리기
  const drawParcelPolygon = (geometry: any, currentMap: any) => {
    const kakao = (window as any).kakao;
    if (!currentMap || !kakao || !geometry) {
      console.warn("drawParcelPolygon: Missing required parameters");
      return;
    }

    let paths: any[] = [];
    
    // Proj4를 이용한 좌표계 변환 및 파싱
    const parsePolygon = (coordinates: any[]) => {
      if (!coordinates || coordinates.length === 0) return [];
      
      // Polygon의 첫 번째 ring (외곽 경계)만 사용
      const outerRing = coordinates[0];
      if (!outerRing || outerRing.length === 0) return [];
      
      const firstPoint = outerRing[0];
      let isTM = firstPoint[0] > 180 || firstPoint[1] > 90; // EPSG:5179 감지

      if (isTM) {
        try {
          if (proj4) {
            proj4.defs("EPSG:5179", "+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs");
            const proj = proj4("EPSG:5179", "EPSG:4326");
            return outerRing.map((coord: number[]) => {
              const [lon, lat] = proj.forward([coord[0], coord[1]]);
              return new kakao.maps.LatLng(lat, lon);
            });
          }
          return [];
        } catch(e) { 
          console.error("Proj4 conversion error", e);
          return []; 
        }
      } else {
        return outerRing.map((coord: number[]) => 
          new kakao.maps.LatLng(coord[1], coord[0])
        );
      }
    };

    try {
      if (geometry.type === 'Polygon') {
        paths = parsePolygon(geometry.coordinates);
      } else if (geometry.type === 'MultiPolygon') {
        // MultiPolygon의 경우 첫 번째 Polygon만 사용
        if (geometry.coordinates && geometry.coordinates.length > 0) {
          paths = parsePolygon(geometry.coordinates[0]);
        }
      } else {
        console.warn("drawParcelPolygon: Unsupported geometry type", geometry.type);
        return;
      }
    } catch (e) {
      console.error("Geometry parsing error", e);
      return;
    }

    if (paths.length > 0) {
      try {
        const polygon = new kakao.maps.Polygon({
          path: paths,
          strokeWeight: 3,
          strokeColor: '#f97316', // Orange-500
          strokeOpacity: 1,
          strokeStyle: 'solid',
          fillColor: '#f97316',
          fillOpacity: 0.2
        });
        polygon.setMap(currentMap);
        kakaoGisRef.current.cadastralPolygon = polygon;
        console.log("Cadastral polygon drawn successfully", paths.length, "points");
        
        // 폴리곤 생성 후 infowindow 위치를 클릭한 위치의 상단 10px 지점에 표시
        if (kakaoGisRef.current.cadastralOverlay && kakaoGisRef.current.cadastralClickPos) {
          // 클릭한 위치의 위도/경도
          const clickLat = kakaoGisRef.current.cadastralClickPos.getLat();
          const clickLng = kakaoGisRef.current.cadastralClickPos.getLng();
          
          // 지도의 현재 줌 레벨 가져오기
          const zoomLevel = currentMap.getLevel();
          
          // 줌 레벨에 따른 위도 오프셋 계산 (10px를 위도로 변환)
          // 줌 레벨이 높을수록(숫자가 작을수록) 더 작은 오프셋 필요
          // 대략적인 계산: 줌 레벨 1에서 위도 1도 ≈ 111km, 화면 256px
          // 줌 레벨 N에서 1px ≈ (111km / 256) / (2^(N-1)) ≈ 0.0001 / (2^(N-1)) 도
          // 10px ≈ 0.001 / (2^(N-1)) 도
          // 간단하게 줌 레벨에 따라 조정: 줌 레벨이 높을수록(숫자가 작을수록) 더 큰 오프셋
          const baseOffset = 0.0001; // 기본 오프셋 (약 11m)
          const zoomFactor = Math.pow(2, Math.max(0, zoomLevel - 3)); // 줌 레벨에 따른 조정
          const latOffset = baseOffset / zoomFactor; // 위도 오프셋 (상단이므로 위도 증가)
          
          // 클릭 위치의 상단 10px 지점에 배치
          const infoWindowLat = clickLat + latOffset;
          const infoWindowPos = new window.kakao.maps.LatLng(infoWindowLat, clickLng);
          
          // infowindow 위치 업데이트
          kakaoGisRef.current.cadastralOverlay.setPosition(infoWindowPos);
        }
      } catch (e) {
        console.error("Failed to create polygon", e);
      }
    } else {
      console.warn("drawParcelPolygon: No paths generated");
    }
  };

  // CHANGE: Right click -> Left click for Address (업그레이드: 지적 경계 폴리곤 기능 추가)
  const setupKakaoAddressClick = () => {
    if (kakaoGisRef.current.addressClickListener) {
        window.kakao.maps.event.removeListener(mapRef.current, 'click', kakaoGisRef.current.addressClickListener);
    }
    const onMapClick = (e: any) => {
      if (gisMode !== GISMode.DEFAULT) return;
      if (!kakaoGisRef.current.geocoder) return;
      
      // 닫기 버튼 클릭 시 지도 클릭 이벤트 무시
      if (isCadastralCloseClick.current) {
        isCadastralCloseClick.current = false;
        return;
      }

      const pos = e.latLng;
      const currentMap = mapRef.current;

      // 기존 지적 관련 그래픽 제거
      clearCadastralGraphics();
      
      // 클릭 위치 저장 (infowindow 위치 계산용)
      kakaoGisRef.current.cadastralClickPos = pos;

      // 1. 마커 표시 제거 (요청사항: 마커가 표시되지 않도록)

      // 2. 주소 변환 및 커스텀 오버레이(InfoWindow) 표시
      kakaoGisRef.current.geocoder.coord2Address(pos.getLng(), pos.getLat(), (result: any, status: any) => {
        if (status === window.kakao.maps.services.Status.OK) {
          const roadAddr = result[0].road_address ? result[0].road_address.address_name : '';
          const jibunAddr = result[0].address ? result[0].address.address_name : '';
          const mainAddr = roadAddr || jibunAddr;
          const subAddr = roadAddr ? jibunAddr : '';
          
          const lat = pos.getLat().toFixed(7);
          const lng = pos.getLng().toFixed(7);
          
          // 커스텀 오버레이 디자인 (말풍선 스타일)
          const contentDiv = document.createElement('div');
          contentDiv.style.cssText = `
            position: relative;
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(8px);
            padding: 12px 16px;
            border-radius: 12px;
            border: 1px solid rgba(0,0,0,0.1);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            font-family: 'Pretendard', sans-serif;
            min-width: 200px;
            transform: translateY(-45px);
            animation: fadeIn 0.3s ease-out;
          `;
          
          // 닫기 버튼
          const closeBtn = document.createElement('button');
          closeBtn.innerHTML = '✕';
          closeBtn.style.cssText = `
            position: absolute;
            top: 8px;
            right: 8px;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: rgba(0, 0, 0, 0.1);
            color: #64748b;
            border: none;
            cursor: pointer;
            font-size: 12px;
            line-height: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
          `;
          closeBtn.title = '닫기';
          closeBtn.onmouseover = () => {
            closeBtn.style.background = 'rgba(239, 68, 68, 0.2)';
            closeBtn.style.color = '#ef4444';
          };
          closeBtn.onmouseout = () => {
            closeBtn.style.background = 'rgba(0, 0, 0, 0.1)';
            closeBtn.style.color = '#64748b';
          };
          // 닫기 버튼 클릭 핸들러
          const handleCloseBtnClick = (e: any) => {
            e.stopPropagation();
            e.preventDefault();
            isCadastralCloseClick.current = true; // 플래그 설정
            if (kakaoGisRef.current.cadastralOverlay) {
              kakaoGisRef.current.cadastralOverlay.setMap(null);
              kakaoGisRef.current.cadastralOverlay = null;
            }
            // 플래그를 짧은 시간 후 리셋 (안전장치)
            setTimeout(() => {
              isCadastralCloseClick.current = false;
            }, 100);
          };
          
          // mousedown, mouseup, click 이벤트에 모두 리스너 추가 (capture phase)
          closeBtn.addEventListener('mousedown', (e: any) => { 
            e.stopPropagation(); 
            e.preventDefault(); 
            isCadastralCloseClick.current = true;
          }, true);
          closeBtn.addEventListener('mouseup', (e: any) => { 
            e.stopPropagation(); 
            e.preventDefault(); 
            isCadastralCloseClick.current = true;
          }, true);
          closeBtn.addEventListener('click', handleCloseBtnClick, true);
          
          // 내용 HTML
          contentDiv.innerHTML = `
            <div style="font-size: 11px; color: #3b82f6; font-weight: 700; text-transform: uppercase; margin-bottom: 4px;">
              Selected Location
            </div>
            <div style="font-size: 14px; font-weight: 700; color: #1e293b; line-height: 1.4; word-break: keep-all;">
              ${mainAddr}
            </div>
            ${subAddr ? `<div style="font-size: 12px; color: #64748b; margin-top: 2px;">(지번) ${subAddr}</div>` : ''}
            
            <div style="margin-top: 8px; padding-top: 6px; border-top: 1px dashed rgba(0,0,0,0.15); font-size: 11px; color: #64748b;">
              <div style="display:flex; justify-content:space-between;"><span>X</span> <span style="font-family: monospace; font-weight:600;">${lng}</span></div>
              <div style="display:flex; justify-content:space-between;"><span>Y</span> <span style="font-family: monospace; font-weight:600;">${lat}</span></div>
            </div>
            
            <div id="cadastral-pnu-section" style="margin-top: 6px; padding-top: 6px; border-top: 1px dashed rgba(0,0,0,0.15); font-size: 11px; color: #64748b;">
              <!-- PNU 정보는 fetchCadastralInfoStep1에서 추가됨 -->
            </div>

            <div style="
              position: absolute; bottom: -6px; left: 50%; transform: translateX(-50%) rotate(45deg);
              width: 12px; height: 12px; background: rgba(255, 255, 255, 0.95);
              border-bottom: 1px solid rgba(0,0,0,0.1); border-right: 1px solid rgba(0,0,0,0.1);
            "></div>
            <style>@keyframes fadeIn { from { opacity: 0; transform: translateY(-40px); } to { opacity: 1; transform: translateY(-45px); } }</style>
          `;
          
          // 닫기 버튼을 contentDiv에 추가
          contentDiv.appendChild(closeBtn);
          
          // contentDiv의 클릭 이벤트 전파 방지 (버튼이 아닌 부분 클릭 시 지도 클릭 방지)
          contentDiv.addEventListener('mousedown', (e: any) => {
            e.stopPropagation();
          });
          contentDiv.addEventListener('mouseup', (e: any) => {
            e.stopPropagation();
          });
          contentDiv.addEventListener('click', (e: any) => {
            e.stopPropagation();
          });

          const overlay = new window.kakao.maps.CustomOverlay({
            content: contentDiv,
            map: currentMap,
            position: pos,
            yAnchor: 1,
            zIndex: 100
          });

          kakaoGisRef.current.cadastralOverlay = overlay;
        }
      });

      // 3. 지적 정보 호출 (PNU 조회 -> 폴리곤 생성)
      fetchCadastralInfoStep1(pos.getLng(), pos.getLat(), currentMap);
    };
    kakaoGisRef.current.addressClickListener = onMapClick;
    window.kakao.maps.event.addListener(mapRef.current, 'click', onMapClick);
  };
  
  useEffect(() => {
    if (config.type === 'kakao' && mapRef.current && sdkLoaded) {
        setupKakaoAddressClick();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gisMode, config.type, sdkLoaded]);


  // 4. Update Effects
  useEffect(() => {
    // 기존 방식 사용 (Provider 시스템은 좌표 검증 문제가 있으므로 기존 방식 사용)
    if (!mapRef.current || !sdkLoaded) return;
    if (isDragging.current) return;
    
    // 좌표 유효성 검증
    if (typeof globalState.lat !== 'number' || typeof globalState.lng !== 'number' || 
        isNaN(globalState.lat) || isNaN(globalState.lng) || 
        !isFinite(globalState.lat) || !isFinite(globalState.lng)) {
      console.warn('Global State: 유효하지 않은 좌표', globalState);
      return;
    }
    
    isProgrammaticUpdate.current = true;
    try {
        if (config.type === 'google') {
          mapRef.current.setCenter({ lat: globalState.lat, lng: globalState.lng });
          mapRef.current.setZoom(globalState.zoom);
        } else if (config.type === 'kakao') {
          // 카카오맵이 완전히 초기화되었는지 확인
          if (mapRef.current && typeof mapRef.current.getCenter === 'function') {
            try {
              const center = mapRef.current.getCenter();
              if (center && typeof center.getLat === 'function' && typeof center.getLng === 'function') {
                const centerLat = center.getLat();
                const centerLng = center.getLng();
                if (Math.abs(centerLat - globalState.lat) > 0.000001 || Math.abs(centerLng - globalState.lng) > 0.000001) {
                  mapRef.current.setCenter(new window.kakao.maps.LatLng(globalState.lat, globalState.lng));
                }
                mapRef.current.setLevel(zoomToKakao(globalState.zoom));
              }
            } catch (e) {
              // 맵이 아직 완전히 초기화되지 않은 경우 무시
              console.warn('Kakao map not ready for getCenter:', e);
            }
          }
        } else if (config.type === 'naver') {
          mapRef.current.setCenter(new window.naver.maps.LatLng(globalState.lat, globalState.lng));
          mapRef.current.setZoom(globalState.zoom);
        }
    } catch(e) {
      console.error('Map state update error:', e);
    }
    setTimeout(() => { isProgrammaticUpdate.current = false; }, 200); 
  }, [globalState.lat, globalState.lng, globalState.zoom, config.type, sdkLoaded]);

  useEffect(() => {
    if (!mapRef.current || !sdkLoaded) return;
    
    // 맵 타입이 실제로 변경되었는지 확인 (초기화 직후에는 변경하지 않음)
    const timer = setTimeout(() => {
      try {
        if (config.type === 'google' && window.google && window.google.maps) {
          const mapTypeId = config.isSatellite ? 'satellite' : 'roadmap';
          if (typeof mapRef.current?.setMapTypeId === 'function') {
            mapRef.current.setMapTypeId(mapTypeId);
          }
        } else if (config.type === 'kakao' && window.kakao && window.kakao.maps) {
          const mapTypeId = config.isSatellite ? window.kakao.maps.MapTypeId.HYBRID : window.kakao.maps.MapTypeId.ROADMAP;
          if (typeof mapRef.current?.setMapTypeId === 'function') {
            mapRef.current.setMapTypeId(mapTypeId);
          }
        } else if (config.type === 'naver' && window.naver && window.naver.maps) {
          const mapTypeId = config.isSatellite ? window.naver.maps.MapTypeId.SATELLITE : window.naver.maps.MapTypeId.NORMAL;
          if (typeof mapRef.current?.setMapTypeId === 'function') {
            mapRef.current.setMapTypeId(mapTypeId);
          }
        }
      } catch(e) {
        console.error('Map type change error:', e);
      }
    }, 100); // 맵 초기화 후 약간의 지연
    
    return () => clearTimeout(timer);
  }, [config.isSatellite, config.type, sdkLoaded]);

  useEffect(() => {
    // 🆕 새 Provider 시스템 사용 시
    if (useNewProvider && mapProviderRef.current) {
      mapProviderRef.current.setMarker(searchPos);
      return;
    }
    
    // 기존 방식
    if (!mapRef.current) return;
    if (markerRef.current) {
        try { markerRef.current.setMap(null); } catch(e){}
    }
    if (searchPos) {
      try {
          if (config.type === 'google') {
            markerRef.current = new window.google.maps.Marker({ position: searchPos, map: mapRef.current });
          } else if (config.type === 'kakao') {
            markerRef.current = new window.kakao.maps.Marker({ position: new window.kakao.maps.LatLng(searchPos.lat, searchPos.lng), map: mapRef.current });
          } else if (config.type === 'naver') {
            markerRef.current = new window.naver.maps.Marker({ position: new window.naver.maps.LatLng(searchPos.lat, searchPos.lng), map: mapRef.current });
          }
      } catch(e) {}
    }
  }, [searchPos, config.type, sdkLoaded, useNewProvider]);

  // -- Street View Synchronization Effect --
  useEffect(() => {
    // 다른 패널에서 거리뷰 위치가 변경되면 현재 패널도 동일한 위치의 거리뷰 표시
    // 단, 현재 패널이 이미 해당 위치의 거리뷰를 보고 있으면 무시
    if (!streetViewState || !streetViewState.active || !mapRef.current || !sdkLoaded) {
      return;
    }

    const { lat, lng } = streetViewState;
    
    // 좌표 유효성 검증
    if (typeof lat !== 'number' || typeof lng !== 'number' || 
        isNaN(lat) || isNaN(lng) || 
        !isFinite(lat) || !isFinite(lng)) {
      console.warn('Street View State: 유효하지 않은 좌표', { lat, lng });
      return;
    }
    
    // 현재 거리뷰 위치와 동일하면 무시 (무한 루프 방지)
    if (isStreetViewActive) {
      let currentLat = 0, currentLng = 0;
      if (config.type === 'google' && googlePanoInstanceRef.current && googlePanoInstanceRef.current.getPosition()) {
        const pos = googlePanoInstanceRef.current.getPosition();
        if (pos) {
          const posLat = pos.lat();
          const posLng = pos.lng();
          if (typeof posLat === 'number' && typeof posLng === 'number' && 
              !isNaN(posLat) && !isNaN(posLng) && 
              isFinite(posLat) && isFinite(posLng)) {
            currentLat = posLat;
            currentLng = posLng;
          }
        }
      } else if (config.type === 'kakao' && kakaoGisRef.current.rv && kakaoGisRef.current.rv.getPosition()) {
        const pos = kakaoGisRef.current.rv.getPosition();
        currentLat = pos.getLat();
        currentLng = pos.getLng();
      } else if (config.type === 'naver' && naverPanoramaRef.current && naverPanoramaRef.current.getPosition()) {
        const pos = naverPanoramaRef.current.getPosition();
        currentLat = pos.lat();
        currentLng = pos.lng();
      }
      
      // 위치 차이가 매우 작으면 (같은 위치) 무시
      if (Math.abs(currentLat - lat) < 0.0001 && Math.abs(currentLng - lng) < 0.0001) {
        return;
      }
    }
    
    // 현재 패널이 이미 거리뷰를 보고 있지 않은 경우에만 동기화
    if (!isStreetViewActive) {
      if (config.type === 'google' && googlePanoInstanceRef.current) {
        // 구글맵 거리뷰 시작
        // 컨테이너가 제대로 렌더링되었는지 확인
        if (googlePanoRef.current) {
          // 컨테이너 스타일 보장
          googlePanoRef.current.style.display = 'block';
          googlePanoRef.current.style.position = 'absolute';
          googlePanoRef.current.style.top = '0';
          googlePanoRef.current.style.left = '0';
          googlePanoRef.current.style.right = '0';
          googlePanoRef.current.style.bottom = '0';
          googlePanoRef.current.style.width = '100%';
          googlePanoRef.current.style.height = '100%';
          googlePanoRef.current.style.margin = '0';
          googlePanoRef.current.style.padding = '0';
          googlePanoRef.current.style.boxSizing = 'border-box';
        }
        
        // 파노라마 위치 설정 및 표시
        googlePanoInstanceRef.current.setPosition({ lat, lng });
        
        // 파노라마가 로드될 때까지 대기
        const panorama = googlePanoInstanceRef.current;
        if (window.google && window.google.maps) {
          const statusListener = panorama.addListener('status_changed', () => {
            const status = panorama.getStatus();
            if (status === 'OK') {
              panorama.setVisible(true);
              setIsStreetViewActive(true);
              // Coverage Layer 표시
              if (googleCoverageLayerRef.current && mapRef.current) {
                googleCoverageLayerRef.current.setMap(mapRef.current);
              }
              // 리스너 제거
              window.google.maps.event.removeListener(statusListener);
            } else if (status === 'ZERO_RESULTS' || status === 'NOT_FOUND') {
              console.warn('Google Street View: 해당 위치에 거리뷰 이미지가 없습니다', { lat, lng });
              setIsStreetViewActive(false);
              window.google.maps.event.removeListener(statusListener);
            } else if (status === 'ERROR') {
              console.error('Google Street View: 로드 오류', { lat, lng });
              setIsStreetViewActive(false);
              window.google.maps.event.removeListener(statusListener);
            }
          });
          
          // 타임아웃 설정 (5초 후에도 로드되지 않으면 실패로 처리)
          setTimeout(() => {
            if (panorama.getStatus() !== 'OK') {
              console.warn('Google Street View: 로드 타임아웃', { lat, lng });
              setIsStreetViewActive(false);
              try {
                window.google.maps.event.removeListener(statusListener);
              } catch (e) {
                // 이미 제거된 경우 무시
              }
            }
          }, 5000);
        } else {
          // SDK가 로드되지 않은 경우 즉시 표시 시도
          panorama.setVisible(true);
          setIsStreetViewActive(true);
        }
      } else if (config.type === 'kakao' && kakaoGisRef.current.rvClient) {
        // 카카오맵 로드뷰 시작
        const pos = new window.kakao.maps.LatLng(lat, lng);
        kakaoGisRef.current.rvClient.getNearestPanoId(pos, 50, (panoId: any) => {
          if (panoId && roadviewRef.current) {
            setIsStreetViewActive(true);
            setTimeout(() => {
              if (roadviewRef.current && mapRef.current) {
                const rv = new window.kakao.maps.Roadview(roadviewRef.current);
                rv.setPanoId(panoId, pos);
                kakaoGisRef.current.rv = rv;
                
                // 미니맵 중앙으로 이동 및 지도 리사이즈
                mapRef.current.setCenter(pos);
                mapRef.current.relayout(); // 미니맵 전환 후 리사이즈 필수
                
                // 지도 리사이즈 완료 후 Walker 생성 (컨테이너 크기 변경 대기)
                setTimeout(() => {
                  if (!mapRef.current) return;
                  
                  // 초기 viewpoint 각도 가져오기
                  const initialViewpoint = rv.getViewpoint();
                  const initialAngle = initialViewpoint ? initialViewpoint.pan : 0;
                  
                  // Walker 생성 또는 업데이트 (초기 각도 포함, 중복 방지)
                  // 기존 walker가 있으면 완전히 제거 후 재생성
                  if (kakaoGisRef.current.walkerOverlay) {
                    try {
                      kakaoGisRef.current.walkerOverlay.setMap(null);
                    } catch (e) {
                      // 이미 제거된 경우 무시
                    }
                    kakaoGisRef.current.walkerOverlay = null;
                  }
                  // 새로운 walker 생성
                  createKakaoWalker(pos, mapRef.current, initialAngle);
                  
                  // 위치 변경 이벤트 리스너 (중복 방지)
                  if (kakaoGisRef.current.rv) {
                    window.kakao.maps.event.removeListener(kakaoGisRef.current.rv, 'position_changed');
                    window.kakao.maps.event.removeListener(kakaoGisRef.current.rv, 'viewpoint_changed');
                  }
                  
                  const positionListener = () => {
                    const rvPos = rv.getPosition();
                    const viewpoint = rv.getViewpoint();
                    if (kakaoGisRef.current.walkerOverlay && mapRef.current) {
                      // walker 위치 업데이트
                      kakaoGisRef.current.walkerOverlay.setPosition(rvPos);
                      kakaoGisRef.current.walkerOverlay.setMap(mapRef.current);
                      // walker 위치 업데이트 직후 폴리곤도 같은 위치로 업데이트 (동기화 보장)
                      if (viewpoint) {
                        createKakaoDirectionPolygon(rvPos, viewpoint.pan, mapRef.current);
                      }
                    }
                    if (mapRef.current) {
                      mapRef.current.setCenter(rvPos);
                    }
                  };
                  
                  const viewpointListener = () => {
                    const viewpoint = rv.getViewpoint();
                    const rvPos = rv.getPosition();
                    if (kakaoGisRef.current.walkerOverlay) {
                      const content = kakaoGisRef.current.walkerOverlay.getContent();
                      if (content) {
                        // 방향 비추기: 거리뷰 방향에 따라 walker 회전
                        content.style.transformOrigin = 'center center'; // 중심 기준 회전
                        content.style.transform = `rotate(${viewpoint.pan}deg)`;
                      }
                      // Walker 위치도 거리뷰 위치와 동기화
                      if (rvPos && mapRef.current) {
                        kakaoGisRef.current.walkerOverlay.setPosition(rvPos);
                        kakaoGisRef.current.walkerOverlay.setMap(mapRef.current);
                        // walker 위치 업데이트 직후 폴리곤도 같은 위치로 업데이트 (동기화 보장)
                        createKakaoDirectionPolygon(rvPos, viewpoint.pan, mapRef.current);
                      }
                    }
                  };
                  
                  window.kakao.maps.event.addListener(rv, 'position_changed', positionListener);
                  window.kakao.maps.event.addListener(rv, 'viewpoint_changed', viewpointListener);
                }, 400); // 컨테이너 크기 변경 완료 대기 (350ms 트랜지션 + 여유)
              }
            }, 300);
          }
        });
      } else if (config.type === 'naver' && naverStreetLayerRef.current) {
        // 네이버맵 거리뷰 시작
        const latlng = new window.naver.maps.LatLng(lat, lng);
        
        // 거리뷰 레이어 활성화 (없으면 활성화)
        if (!naverStreetLayerRef.current.getMap()) {
          naverStreetLayerRef.current.setMap(mapRef.current);
          setIsNaverLayerOn(true);
        }
        
        setIsStreetViewActive(true);
        
        setTimeout(() => {
          const container = naverPanoContainerRef.current;
          if (!container) {
            console.error('Naver Panorama: 컨테이너가 없습니다');
            return;
          }
          
          // 컨테이너 크기 확인 및 설정
          if (container.offsetWidth === 0 || container.offsetHeight === 0) {
            setTimeout(() => {
              if (container.offsetWidth > 0 && container.offsetHeight > 0) {
                if (!naverPanoramaRef.current) {
                  initNaverPanorama(container, latlng, mapRef.current);
                } else {
                  // 기존 파노라마 위치 업데이트
                  naverPanoramaRef.current.setPosition(latlng);
                  
                  // 즉시 마커 업데이트 (position_changed 이벤트 대기 없이)
                  if (mapRef.current) {
                    mapRef.current.setCenter(latlng);
                    
                    const pov = naverPanoramaRef.current ? naverPanoramaRef.current.getPov() : null;
                    const angle = pov ? pov.pan : 0;
                    
                    if (naverMarkerRef.current) {
                      naverMarkerRef.current.setPosition(latlng);
                      naverMarkerRef.current.setIcon(createNaverTriangleMarker(angle));
                      if (typeof naverMarkerRef.current.setAngle === 'function') {
                        naverMarkerRef.current.setAngle(angle);
                      }
                      naverMarkerRef.current.setMap(mapRef.current);
                    } else {
                      const icon = createNaverTriangleMarker(angle);
                      naverMarkerRef.current = new window.naver.maps.Marker({
                        position: latlng,
                        map: mapRef.current,
                        icon: icon,
                        angle: angle
                      });
                    }
                    
                    // 방향 표시 폴리곤 생성/업데이트
                    createNaverDirectionPolygon(latlng, angle, mapRef.current);
                    
                    // setCenter 후 marker를 미니맵 중앙에 유지 (비동기 처리 보완)
                    requestAnimationFrame(() => {
                      if (mapRef.current && naverMarkerRef.current) {
                        const currentCenter = mapRef.current.getCenter();
                        if (currentCenter) {
                          // marker 위치를 지도 중심으로 다시 설정
                          naverMarkerRef.current.setPosition(currentCenter);
                          // 지도 중심도 다시 설정 (이중 보장)
                          mapRef.current.setCenter(latlng);
                        }
                      }
                    });
                  }
                  
                  window.naver.maps.Event.trigger(naverPanoramaRef.current, 'resize');
                }
              }
            }, 200);
            return;
          }
          
          if (!naverPanoramaRef.current) {
            initNaverPanorama(container, latlng, mapRef.current);
            // 파노라마 초기화 후 리사이즈 이벤트 트리거 (렌더링 보장)
            setTimeout(() => {
              if (naverPanoramaRef.current) {
                window.naver.maps.Event.trigger(naverPanoramaRef.current, 'resize');
              }
            }, 200);
          } else {
            // 기존 파노라마 위치 업데이트
            naverPanoramaRef.current.setPosition(latlng);
            
            // 즉시 마커 업데이트 (position_changed 이벤트 대기 없이)
            if (mapRef.current) {
              mapRef.current.setCenter(latlng);
              
              const pov = naverPanoramaRef.current ? naverPanoramaRef.current.getPov() : null;
              const angle = pov ? pov.pan : 0;
              
              if (naverMarkerRef.current) {
                naverMarkerRef.current.setPosition(latlng);
                naverMarkerRef.current.setIcon(createNaverTriangleMarker(angle));
                if (typeof naverMarkerRef.current.setAngle === 'function') {
                  naverMarkerRef.current.setAngle(angle);
                }
                naverMarkerRef.current.setMap(mapRef.current);
              } else {
                const icon = createNaverTriangleMarker(angle);
                naverMarkerRef.current = new window.naver.maps.Marker({
                  position: latlng,
                  map: mapRef.current,
                  icon: icon,
                  angle: angle
                });
              }
              
              // 방향 표시 폴리곤 생성/업데이트
              createNaverDirectionPolygon(latlng, angle, mapRef.current);
              
              // setCenter 후 marker를 미니맵 중앙에 유지 (비동기 처리 보완)
              requestAnimationFrame(() => {
                if (mapRef.current && naverMarkerRef.current) {
                  const currentCenter = mapRef.current.getCenter();
                  if (currentCenter) {
                    // marker 위치를 지도 중심으로 다시 설정
                    naverMarkerRef.current.setPosition(currentCenter);
                    // 지도 중심도 다시 설정 (이중 보장)
                    mapRef.current.setCenter(latlng);
                  }
                }
              });
            }
            
            setTimeout(() => {
              if (naverPanoramaRef.current) {
                window.naver.maps.Event.trigger(naverPanoramaRef.current, 'resize');
              }
            }, 100);
          }
        }, 150);
      }
    } else {
      // 이미 거리뷰가 활성화된 경우 위치만 업데이트
      if (config.type === 'google' && googlePanoInstanceRef.current) {
        googlePanoInstanceRef.current.setPosition({ lat, lng });
      } else if (config.type === 'kakao' && kakaoGisRef.current.rv && kakaoGisRef.current.rvClient) {
        const pos = new window.kakao.maps.LatLng(lat, lng);
        kakaoGisRef.current.rvClient.getNearestPanoId(pos, 50, (panoId: any) => {
          if (panoId && mapRef.current) {
            kakaoGisRef.current.rv.setPanoId(panoId, pos);
            mapRef.current.setCenter(pos);
            mapRef.current.relayout(); // 리사이즈 보장
            
            // Walker 업데이트 또는 생성 (로드뷰가 활성화되어 있을 때만, 중복 방지)
            if (isStreetViewActive) {
              setTimeout(() => {
                // walker가 이미 존재하면 위치만 업데이트
                if (kakaoGisRef.current.walkerOverlay && mapRef.current) {
                  try {
                    kakaoGisRef.current.walkerOverlay.setPosition(pos);
                    kakaoGisRef.current.walkerOverlay.setMap(mapRef.current);
                  } catch (e) {
                    // walker가 이미 제거된 경우 새로 생성
                    kakaoGisRef.current.walkerOverlay = null;
                    createKakaoWalker(pos, mapRef.current);
                  }
                } else if (mapRef.current) {
                  // walker가 없으면 새로 생성
                  createKakaoWalker(pos, mapRef.current);
                }
              }, 150);
            }
          }
        });
      } else if (config.type === 'naver' && naverPanoramaRef.current) {
        const latlng = new window.naver.maps.LatLng(lat, lng);
        naverPanoramaRef.current.setPosition(latlng);
        window.naver.maps.Event.trigger(naverPanoramaRef.current, 'resize');
        mapRef.current.setCenter(latlng);
        const pov = naverPanoramaRef.current.getPov();
        const angle = pov ? pov.pan : 0;
        if (naverMarkerRef.current) {
          naverMarkerRef.current.setPosition(latlng);
          naverMarkerRef.current.setMap(mapRef.current);
          naverMarkerRef.current.setIcon(createNaverTriangleMarker(angle));
          if (typeof naverMarkerRef.current.setAngle === 'function') {
            naverMarkerRef.current.setAngle(angle);
          }
        } else {
          // 마커가 없으면 생성 (삼각형 마커)
          const icon = createNaverTriangleMarker(angle);
          naverMarkerRef.current = new window.naver.maps.Marker({
            position: latlng,
            map: mapRef.current,
            icon: icon,
            angle: angle
          });
        }
        // 방향 표시 폴리곤 생성/업데이트
        if (mapRef.current) {
          createNaverDirectionPolygon(latlng, angle, mapRef.current);
        }
        
        // setCenter 후 marker를 미니맵 중앙에 유지 (비동기 처리 보완)
        requestAnimationFrame(() => {
          if (mapRef.current && naverMarkerRef.current) {
            const currentCenter = mapRef.current.getCenter();
            if (currentCenter) {
              // marker 위치를 지도 중심으로 다시 설정
              naverMarkerRef.current.setPosition(currentCenter);
              // 지도 중심도 다시 설정 (이중 보장)
              mapRef.current.setCenter(latlng);
            }
          }
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streetViewState, config.type, sdkLoaded]);

  // -- Naver Street View Click Listener & Marker Sync --
  useEffect(() => {
    if (config.type === 'naver' && mapRef.current && sdkLoaded) {
        const map = mapRef.current;
        
        // Listen to map clicks to open Panorama
        const clickListener = window.naver.maps.Event.addListener(map, 'click', (e: any) => {
            const streetLayer = naverStreetLayerRef.current;
            
            // Only proceed if the Street Layer is currently ON (isNaverLayerOn 상태 확인)
            if (streetLayer && isNaverLayerOn && streetLayer.getMap()) {
                console.log('Naver Street View: 클릭 이벤트 감지', e.coord);
                const latlng = e.coord;
                
                // Show Panorama UI
                setIsStreetViewActive(true);
                
                // Init Panorama & Marker (거리뷰 활성화 후 컨테이너가 렌더링될 때까지 대기)
                // requestAnimationFrame을 사용하여 DOM 업데이트 보장
                requestAnimationFrame(() => {
                    setTimeout(() => {
                        const container = naverPanoContainerRef.current;
                        if (!container) {
                            console.error('Naver Panorama: 컨테이너가 없습니다');
                            setIsStreetViewActive(false);
                            return;
                        }
                        
                        // 컨테이너가 실제로 렌더링되었는지 확인
                        if (container.offsetWidth === 0 || container.offsetHeight === 0) {
                            console.warn('Naver Panorama: 컨테이너 크기가 0입니다. 재시도합니다.');
                            setTimeout(() => {
                                if (container.offsetWidth > 0 && container.offsetHeight > 0) {
                                    initializePanorama();
                                } else {
                                    console.error('Naver Panorama: 컨테이너가 렌더링되지 않았습니다');
                                    setIsStreetViewActive(false);
                                }
                            }, 200);
                            return;
                        }
                        
                        initializePanorama();
                        
                        function initializePanorama() {
                            try {
                                // 미니맵 중앙으로 이동
                                if (mapRef.current) {
                                    mapRef.current.setCenter(latlng);
                                }
                                
                                // Create or Update Panorama
                                if (!naverPanoramaRef.current) {
                                    initNaverPanorama(container, latlng, map);
                                    // 파노라마 초기화 후 리사이즈 이벤트 트리거 (렌더링 보장)
                                    setTimeout(() => {
                                        if (naverPanoramaRef.current) {
                                            window.naver.maps.Event.trigger(naverPanoramaRef.current, 'resize');
                                        }
                                    }, 200);
                                } else {
                                    // 기존 파노라마 위치 업데이트
                                    naverPanoramaRef.current.setPosition(latlng);
                                    
                                    // 즉시 마커 업데이트 (position_changed 이벤트 대기 없이)
                                    if (mapRef.current) {
                                        const pov = naverPanoramaRef.current ? naverPanoramaRef.current.getPov() : null;
                                        const angle = pov ? pov.pan : 0;
                                        
                                        if (naverMarkerRef.current) {
                                            naverMarkerRef.current.setPosition(latlng);
                                            naverMarkerRef.current.setIcon(createNaverTriangleMarker(angle));
                                            if (typeof naverMarkerRef.current.setAngle === 'function') {
                                                naverMarkerRef.current.setAngle(angle);
                                            }
                                            naverMarkerRef.current.setMap(mapRef.current);
                                        } else {
                                            const icon = createNaverTriangleMarker(angle);
                                            naverMarkerRef.current = new window.naver.maps.Marker({
                                                position: latlng,
                                                map: mapRef.current,
                                                icon: icon,
                                                angle: angle
                                            });
                                        }
                                        
                                        // 방향 표시 폴리곤 생성/업데이트
                                        createNaverDirectionPolygon(latlng, angle, mapRef.current);
                                    }
                                    
                                    // 리사이즈 이벤트 트리거
                                    setTimeout(() => {
                                        if (naverPanoramaRef.current) {
                                            window.naver.maps.Event.trigger(naverPanoramaRef.current, 'resize');
                                        }
                                    }, 100);
                                }

                                // 거리뷰 상태 업데이트 (동기화를 위해)
                                onStreetViewChange({ lat: latlng.lat(), lng: latlng.lng(), active: true });
                            } catch (error) {
                                console.error('Naver Panorama 생성 오류:', error);
                                setIsStreetViewActive(false);
                            }
                        }
                    }, 100);
                });
            }
        });

        return () => {
            try {
                if (clickListener) {
                    // 네이버맵 API: addListener가 반환한 리스너 객체를 removeListener에 직접 전달
                    window.naver.maps.Event.removeListener(clickListener);
                }
            } catch (error) {
                // 이미 제거된 리스너이거나 유효하지 않은 리스너인 경우 무시
                // 에러를 출력하지 않고 조용히 무시 (정상적인 상황일 수 있음)
            }
        };
    }
  }, [config.type, sdkLoaded, naverStreetLayerRef, isNaverLayerOn]);


  // -- Kakao Measurement Effect --
  useEffect(() => {
    if (config.type !== 'kakao' || !mapRef.current) return;
    
    // Clear listeners from previous mode
    kakaoDrawingRef.current.listeners.forEach(fn => {
      try {
        if (typeof fn === 'function') {
          fn();
        }
      } catch (error) {
        // 이미 제거된 리스너인 경우 무시
      }
    });
    kakaoDrawingRef.current.listeners = [];
    
    // Clear previous overlays
    kakaoDrawingRef.current.overlays.forEach(o => o.setMap(null));
    kakaoDrawingRef.current.overlays = [];

    const map = mapRef.current;

    // 1. Distance Measurement
    if (gisMode === GISMode.DISTANCE) {
        map.setCursor('crosshair');
        let currentLine: any = null;
        let floatingLine: any = null; // 플로우팅 선 추가
        let floatingOverlay: any = null;
        let fixedOverlays: any[] = [];
        let isButtonClick = false; // 버튼 클릭 플래그
        
        // 거리 계산 헬퍼 함수 (Haversine formula)
        const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
            const R = 6371000; // 지구 반지름 (미터)
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLng = (lng2 - lng1) * Math.PI / 180;
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                      Math.sin(dLng / 2) * Math.sin(dLng / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
        };
        
        const updateFloatingDistance = (mousePos: any) => {
            if (!currentLine) return;
            
            const path = currentLine.getPath();
            if (path.length === 0) return;
            
            // 마지막 포인트와 마우스 위치 사이의 거리 계산
            const lastPoint = path[path.length - 1];
            const distance = Math.round(calculateDistance(
                lastPoint.getLat(), lastPoint.getLng(),
                mousePos.getLat(), mousePos.getLng()
            ));
            
            // 플로우팅 선 업데이트 (마우스 클릭 전까지 표시)
            if (floatingLine) {
                floatingLine.setPath([lastPoint, mousePos]);
            } else {
                floatingLine = new window.kakao.maps.Polyline({
                    map: map,
                    path: [lastPoint, mousePos],
                    strokeWeight: 3,
                    strokeColor: '#FF3333',
                    strokeOpacity: 0.6, // 반투명으로 플로우팅 표시 (카카오맵 스타일)
                    strokeStyle: 'solid', // 실선으로 플로우팅 표시 (카카오맵 스타일)
                    zIndex: 9 // 확정된 선보다 낮은 z-index
                });
                kakaoDrawingRef.current.polylines.push(floatingLine);
            }
            
            // 플로우팅 오버레이 업데이트
            if (floatingOverlay) {
                floatingOverlay.setPosition(mousePos);
                const content = floatingOverlay.getContent();
                if (content) {
                    content.innerHTML = `<div class="measure-label" style="background:rgba(255,255,255,0.9); border:1px solid #333; padding:2.8px 4.2px; border-radius:4px; font-size:8.4px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">${distance}m</div>`;
                }
            } else {
                const content = document.createElement('div');
                content.innerHTML = `<div class="measure-label" style="background:rgba(255,255,255,0.9); border:1px solid #333; padding:2.8px 4.2px; border-radius:4px; font-size:8.4px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">${distance}m</div>`;
                floatingOverlay = new window.kakao.maps.CustomOverlay({
                    map: map,
                    position: mousePos,
                    content: content,
                    yAnchor: 2,
                    zIndex: 100
                });
                kakaoDrawingRef.current.overlays.push(floatingOverlay);
            }
        };
        
        const handleClick = (e: any) => {
            // 버튼 클릭 시 지도 클릭 이벤트 무시
            if (isButtonClick) {
                isButtonClick = false;
                return;
            }
            
            const pos = e.latLng;
            
            // 플로우팅 선 제거 (클릭 시 확정)
            if (floatingLine) {
                floatingLine.setMap(null);
                floatingLine = null;
            }
            
            if (!currentLine) {
                // 첫 번째 포인트
                currentLine = new window.kakao.maps.Polyline({
                    map: map,
                    path: [pos],
                    strokeWeight: 3,
                    strokeColor: '#FF3333',
                    strokeOpacity: 1,
                    strokeStyle: 'solid',
                    zIndex: 10
                });
                kakaoDrawingRef.current.polylines.push(currentLine);
            } else {
                // 두 번째 포인트 이후
                const path = currentLine.getPath();
                path.push(pos);
                currentLine.setPath(path);
                
                // 고정 거리 표시
                const segmentLength = path.length >= 2 
                    ? Math.round(calculateDistance(
                        path[path.length - 2].getLat(), path[path.length - 2].getLng(),
                        path[path.length - 1].getLat(), path[path.length - 1].getLng()
                    ))
                    : 0;
                
                const content = document.createElement('div');
                content.innerHTML = `<div class="measure-label" style="background:white; border:1px solid #333; padding:2.8px 4.2px; border-radius:4px; font-size:8.4px;">${segmentLength}m</div>`;
                const fixedOverlay = new window.kakao.maps.CustomOverlay({
                    map: map,
                    position: pos,
                    content: content,
                    yAnchor: 2,
                    zIndex: 50
                });
                fixedOverlays.push(fixedOverlay);
                kakaoDrawingRef.current.overlays.push(fixedOverlay);
            }
        };
        
        const handleMouseMove = (e: any) => {
            if (currentLine) {
                updateFloatingDistance(e.latLng);
            }
        };
        
        const handleRightClick = (e: any) => {
            if (currentLine) {
                const path = currentLine.getPath();
                if (path.length < 2) {
                    map.setCursor('default');
                    currentLine.setMap(null);
                    currentLine = null;
                    // 플로우팅 선 제거
                    if (floatingLine) {
                        floatingLine.setMap(null);
                        floatingLine = null;
                    }
                    return;
                }
                
                const totalLength = Math.round(currentLine.getLength());
                const lastPos = path[path.length - 1];
                
                // 플로우팅 선 및 오버레이 제거
                if (floatingLine) {
                    floatingLine.setMap(null);
                    floatingLine = null;
                }
                if (floatingOverlay) {
                    floatingOverlay.setMap(null);
                    floatingOverlay = null;
                }
                
                // 전체 거리 표시 및 텍스트 닫기 버튼
                const textCloseBtn = document.createElement('button');
                textCloseBtn.innerHTML = '✕';
                textCloseBtn.style.cssText = 'position:absolute; top:-8px; right:-8px; width:20px; height:20px; border-radius:50%; background:#999; color:white; border:none; cursor:pointer; font-size:12px; line-height:1; box-shadow:0 2px 4px rgba(0,0,0,0.3); pointer-events: auto; z-index: 1000;';
                textCloseBtn.title = '텍스트 박스 닫기';
                
                const content = document.createElement('div');
                content.style.position = 'relative';
                content.style.pointerEvents = 'none'; // 오버레이 자체는 클릭 이벤트를 차단하지 않음
                content.innerHTML = `<div class="measure-label" style="background:white; border:2px solid #FF3333; padding:4.2px 5.6px; border-radius:4px; font-size:9.8px; font-weight:bold; color:#FF3333; pointer-events: none;">총 거리: ${totalLength}m</div>`;
                content.appendChild(textCloseBtn);
                
                // content div의 클릭 이벤트 전파 방지 (버튼이 아닌 부분 클릭 시 지도 클릭 방지)
                content.addEventListener('mousedown', (e: any) => {
                    e.stopPropagation();
                });
                content.addEventListener('mouseup', (e: any) => {
                    e.stopPropagation();
                });
                content.addEventListener('click', (e: any) => {
                    e.stopPropagation();
                });
                
                const totalOverlay = new window.kakao.maps.CustomOverlay({
                    map: map,
                    position: lastPos,
                    content: content,
                    yAnchor: 2,
                    zIndex: 100
                });
                kakaoDrawingRef.current.overlays.push(totalOverlay);
                
                // 도형 삭제 버튼을 마지막 포인트에 인접하여 텍스트 박스 닫기 버튼과 같은 모양으로 배치
                const deleteBtn = document.createElement('button');
                deleteBtn.innerHTML = '✕';
                deleteBtn.style.cssText = 'width:20px; height:20px; border-radius:50%; background:#999; color:white; border:none; cursor:pointer; font-size:12px; line-height:1; box-shadow:0 2px 4px rgba(0,0,0,0.3); pointer-events: auto; z-index: 1000; display: flex; align-items: center; justify-content: center;';
                deleteBtn.title = '측정 객체 삭제';
                
                // 마지막 포인트에 바로 인접하여 배치 (매우 작은 오프셋)
                const deleteBtnPos = new window.kakao.maps.LatLng(
                    lastPos.getLat() + 0.00001, // 매우 작은 오프셋으로 마지막 포인트에 인접
                    lastPos.getLng()
                );
                
                const deleteBtnContainer = document.createElement('div');
                deleteBtnContainer.style.pointerEvents = 'none';
                deleteBtnContainer.appendChild(deleteBtn);
                
                const deleteBtnOverlay = new window.kakao.maps.CustomOverlay({
                    map: map,
                    position: deleteBtnPos,
                    content: deleteBtnContainer,
                    yAnchor: 0.5,
                    xAnchor: 0.5,
                    zIndex: 101
                });
                kakaoDrawingRef.current.overlays.push(deleteBtnOverlay);
                
                // 참조 저장 (currentLine이 null로 설정되기 전에 저장)
                const savedCurrentLine = currentLine;
                const savedFixedOverlays = [...fixedOverlays];
                
                // 텍스트 박스 닫기 버튼 이벤트 처리 (mousedown, mouseup, click 모두 처리)
                const handleTextCloseBtnClick = (e: any) => {
                    e.stopPropagation(); // 이벤트 전파 방지
                    e.preventDefault(); // 기본 동작 방지
                    isButtonClick = true; // 버튼 클릭 플래그 설정
                    
                    // 측정 도중 생성된 텍스트 박스들 삭제 (fixedOverlays)
                    savedFixedOverlays.forEach(o => {
                        o.setMap(null);
                        const overlayIndex = kakaoDrawingRef.current.overlays.indexOf(o);
                        if (overlayIndex > -1) {
                            kakaoDrawingRef.current.overlays.splice(overlayIndex, 1);
                        }
                    });
                    // 총 거리 오버레이 삭제
                    if (totalOverlay) {
                        totalOverlay.setMap(null);
                        const totalOverlayIndex = kakaoDrawingRef.current.overlays.indexOf(totalOverlay);
                        if (totalOverlayIndex > -1) {
                            kakaoDrawingRef.current.overlays.splice(totalOverlayIndex, 1);
                        }
                    }
                };
                textCloseBtn.addEventListener('mousedown', (e: any) => { e.stopPropagation(); e.preventDefault(); }, true);
                textCloseBtn.addEventListener('mouseup', (e: any) => { e.stopPropagation(); e.preventDefault(); }, true);
                textCloseBtn.addEventListener('click', handleTextCloseBtnClick, true);
                
                // 측정 객체 삭제 버튼 이벤트 처리 (mousedown, mouseup, click 모두 처리)
                const handleDeleteBtnClick = (e: any) => {
                    e.stopPropagation(); // 이벤트 전파 방지
                    e.preventDefault(); // 기본 동작 방지
                    isButtonClick = true; // 버튼 클릭 플래그 설정
                    
                    // 폴리라인 삭제 (저장된 참조 사용)
                    if (savedCurrentLine) {
                        savedCurrentLine.setMap(null);
                        // polylines 배열에서도 제거
                        const index = kakaoDrawingRef.current.polylines.indexOf(savedCurrentLine);
                        if (index > -1) {
                            kakaoDrawingRef.current.polylines.splice(index, 1);
                        }
                    }
                    // 모든 오버레이 삭제 (저장된 참조 사용) - 측정 도중 생성된 텍스트 박스들
                    savedFixedOverlays.forEach(o => {
                        o.setMap(null);
                        const overlayIndex = kakaoDrawingRef.current.overlays.indexOf(o);
                        if (overlayIndex > -1) {
                            kakaoDrawingRef.current.overlays.splice(overlayIndex, 1);
                        }
                    });
                    // 총 거리 오버레이도 삭제
                    if (totalOverlay) {
                        totalOverlay.setMap(null);
                        const totalOverlayIndex = kakaoDrawingRef.current.overlays.indexOf(totalOverlay);
                        if (totalOverlayIndex > -1) {
                            kakaoDrawingRef.current.overlays.splice(totalOverlayIndex, 1);
                        }
                    }
                    // 도형 삭제 버튼 오버레이도 삭제
                    if (deleteBtnOverlay) {
                        deleteBtnOverlay.setMap(null);
                        const deleteBtnOverlayIndex = kakaoDrawingRef.current.overlays.indexOf(deleteBtnOverlay);
                        if (deleteBtnOverlayIndex > -1) {
                            kakaoDrawingRef.current.overlays.splice(deleteBtnOverlayIndex, 1);
                        }
                    }
                };
                deleteBtn.addEventListener('mousedown', (e: any) => { e.stopPropagation(); e.preventDefault(); }, true);
                deleteBtn.addEventListener('mouseup', (e: any) => { e.stopPropagation(); e.preventDefault(); }, true);
                deleteBtn.addEventListener('click', handleDeleteBtnClick, true);
                
                map.setCursor('default');
                currentLine = null;
                fixedOverlays = [];
            }
        };

        window.kakao.maps.event.addListener(map, 'click', handleClick);
        window.kakao.maps.event.addListener(map, 'mousemove', handleMouseMove);
        window.kakao.maps.event.addListener(map, 'rightclick', handleRightClick);
        
        kakaoDrawingRef.current.listeners.push(
            () => window.kakao.maps.event.removeListener(map, 'click', handleClick),
            () => window.kakao.maps.event.removeListener(map, 'mousemove', handleMouseMove),
            () => window.kakao.maps.event.removeListener(map, 'rightclick', handleRightClick)
        );
    } 
    // 2. Area Measurement
    else if (gisMode === GISMode.AREA) {
        map.setCursor('crosshair');
        let currentPoly: any = null;
        let floatingLine: any = null; // 플로우팅 선 추가
        let floatingPoly: any = null; // 플로우팅 폴리곤 추가
        let floatingOverlay: any = null;
        let isButtonClick = false; // 버튼 클릭 플래그
        
        const updateFloatingArea = (mousePos: any) => {
            if (!currentPoly) return;
            
            const path = currentPoly.getPath();
            if (path.length < 1) return;
            
            // 첫 번째 포인트 이후부터 플로우팅 선 표시
            if (path.length >= 1) {
                const lastPoint = path[path.length - 1];
                
                // 플로우팅 선 업데이트 (마지막 포인트에서 마우스까지)
                if (floatingLine) {
                    floatingLine.setPath([lastPoint, mousePos]);
                } else {
                    floatingLine = new window.kakao.maps.Polyline({
                        map: map,
                        path: [lastPoint, mousePos],
                        strokeWeight: 3,
                        strokeColor: '#39f',
                        strokeOpacity: 0.6, // 반투명으로 플로우팅 표시 (카카오맵 스타일)
                        strokeStyle: 'solid', // 실선으로 플로우팅 표시 (카카오맵 스타일)
                        zIndex: 9 // 확정된 폴리곤보다 낮은 z-index
                    });
                    kakaoDrawingRef.current.polylines.push(floatingLine);
                }
            }
            
            // 두 번째 포인트 이후부터 플로우팅 폴리곤 표시
            if (path.length >= 2) {
                const tempPath = [...path, mousePos];
                
                // 플로우팅 폴리곤 업데이트
                if (floatingPoly) {
                    floatingPoly.setPath(tempPath);
                } else {
                    floatingPoly = new window.kakao.maps.Polygon({
                        map: map,
                        path: tempPath,
                        strokeWeight: 3,
                        strokeColor: '#39f',
                        strokeOpacity: 0.6, // 반투명으로 플로우팅 표시 (카카오맵 스타일)
                        strokeStyle: 'solid', // 실선으로 플로우팅 표시 (카카오맵 스타일)
                        fillColor: '#A2D4EC',
                        fillOpacity: 0.25, // 반투명하게 플로우팅 표시 (카카오맵 스타일)
                        zIndex: 9 // 확정된 폴리곤보다 낮은 z-index
                    });
                    kakaoDrawingRef.current.polygons.push(floatingPoly);
                }
                
                // 마우스 위치를 포함한 임시 경로로 면적 계산
                const tempPoly = new window.kakao.maps.Polygon({
                    path: tempPath,
                    strokeWeight: 0,
                    fillColor: 'transparent',
                    fillOpacity: 0
                });
                const area = Math.round(tempPoly.getArea());
                
                // 플로우팅 오버레이 업데이트
                if (floatingOverlay) {
                    floatingOverlay.setPosition(mousePos);
                    floatingOverlay.setContent(`<div class="measure-label" style="background:rgba(255,255,255,0.9); border:1px solid #333; padding:2.8px 4.2px; border-radius:4px; font-size:8.4px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">${area}m²</div>`);
                } else {
                    const content = document.createElement('div');
                    content.innerHTML = `<div class="measure-label" style="background:rgba(255,255,255,0.9); border:1px solid #333; padding:2.8px 4.2px; border-radius:4px; font-size:8.4px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">${area}m²</div>`;
                    floatingOverlay = new window.kakao.maps.CustomOverlay({
                        map: map,
                        position: mousePos,
                        content: content,
                        yAnchor: 2,
                        zIndex: 100
                    });
                    kakaoDrawingRef.current.overlays.push(floatingOverlay);
                }
            }
        };
        
        const handleClick = (e: any) => {
            // 버튼 클릭 시 지도 클릭 이벤트 무시
            if (isButtonClick) {
                isButtonClick = false;
                return;
            }
            
            const pos = e.latLng;
            
            // 플로우팅 선 및 폴리곤 제거 (클릭 시 확정)
            if (floatingLine) {
                floatingLine.setMap(null);
                floatingLine = null;
            }
            if (floatingPoly) {
                floatingPoly.setMap(null);
                floatingPoly = null;
            }
            
            if (!currentPoly) {
                currentPoly = new window.kakao.maps.Polygon({
                    map: map,
                    path: [pos],
                    strokeWeight: 3,
                    strokeColor: '#39f',
                    strokeOpacity: 0.8,
                    fillColor: '#A2D4EC',
                    fillOpacity: 0.5, 
                    zIndex: 10
                });
                kakaoDrawingRef.current.polygons.push(currentPoly);
            } else {
                const path = currentPoly.getPath();
                path.push(pos);
                currentPoly.setPath(path);
            }
        };
        
        const handleMouseMove = (e: any) => {
            if (currentPoly) {
                updateFloatingArea(e.latLng);
            }
        };
        
        const handleRightClick = (e: any) => {
            if (currentPoly) {
                const path = currentPoly.getPath();
                if (path.length >= 3) {
                    const area = Math.round(currentPoly.getArea());
                    const lastPos = path[path.length - 1];
                    
                    // 플로우팅 선, 폴리곤 및 오버레이 제거
                    if (floatingLine) {
                        floatingLine.setMap(null);
                        floatingLine = null;
                    }
                    if (floatingPoly) {
                        floatingPoly.setMap(null);
                        floatingPoly = null;
                    }
                    if (floatingOverlay) {
                        floatingOverlay.setMap(null);
                        floatingOverlay = null;
                    }
                    
                    // 면적 표시 및 텍스트 닫기 버튼
                    const textCloseBtn = document.createElement('button');
                    textCloseBtn.innerHTML = '✕';
                    textCloseBtn.style.cssText = 'position:absolute; top:-8px; right:-8px; width:20px; height:20px; border-radius:50%; background:#999; color:white; border:none; cursor:pointer; font-size:12px; line-height:1; box-shadow:0 2px 4px rgba(0,0,0,0.3); pointer-events: auto; z-index: 1000;';
                    textCloseBtn.title = '텍스트 박스 닫기';
                    
                    const content = document.createElement('div');
                    content.style.position = 'relative';
                    content.style.pointerEvents = 'none'; // 오버레이 자체는 클릭 이벤트를 차단하지 않음
                    content.innerHTML = `<div class="measure-label" style="background:white; border:2px solid #39f; padding:4.2px 5.6px; border-radius:4px; font-size:9.8px; font-weight:bold; color:#39f; pointer-events: none;">면적: ${area}m²</div>`;
                    content.appendChild(textCloseBtn);
                    
                    // content div의 클릭 이벤트 전파 방지 (버튼이 아닌 부분 클릭 시 지도 클릭 방지)
                    content.addEventListener('mousedown', (e: any) => {
                        e.stopPropagation();
                    });
                    content.addEventListener('mouseup', (e: any) => {
                        e.stopPropagation();
                    });
                    content.addEventListener('click', (e: any) => {
                        e.stopPropagation();
                    });
                    
                    const areaOverlay = new window.kakao.maps.CustomOverlay({
                        map: map,
                        position: lastPos,
                        content: content,
                        yAnchor: 2,
                        zIndex: 100
                    });
                    kakaoDrawingRef.current.overlays.push(areaOverlay);
                    
                    // 도형 삭제 버튼을 마지막 포인트에 인접하여 텍스트 박스 닫기 버튼과 같은 모양으로 배치
                    const deleteBtn = document.createElement('button');
                    deleteBtn.innerHTML = '✕';
                    deleteBtn.style.cssText = 'width:20px; height:20px; border-radius:50%; background:#999; color:white; border:none; cursor:pointer; font-size:12px; line-height:1; box-shadow:0 2px 4px rgba(0,0,0,0.3); pointer-events: auto; z-index: 1000; display: flex; align-items: center; justify-content: center;';
                    deleteBtn.title = '측정 객체 삭제';
                    
                    // 마지막 포인트에 바로 인접하여 배치 (매우 작은 오프셋)
                    const deleteBtnPos = new window.kakao.maps.LatLng(
                        lastPos.getLat() + 0.00001, // 매우 작은 오프셋으로 마지막 포인트에 인접
                        lastPos.getLng()
                    );
                    
                    const deleteBtnContainer = document.createElement('div');
                    deleteBtnContainer.style.pointerEvents = 'none';
                    deleteBtnContainer.appendChild(deleteBtn);
                    
                    const deleteBtnOverlay = new window.kakao.maps.CustomOverlay({
                        map: map,
                        position: deleteBtnPos,
                        content: deleteBtnContainer,
                        yAnchor: 0.5,
                        xAnchor: 0.5,
                        zIndex: 101
                    });
                    kakaoDrawingRef.current.overlays.push(deleteBtnOverlay);
                    
                    // 참조 저장 (currentPoly가 null로 설정되기 전에 저장)
                    const savedCurrentPoly = currentPoly;
                    
                    // 텍스트 박스 닫기 버튼 이벤트 처리 (mousedown, mouseup, click 모두 처리)
                    const handleTextCloseBtnClick = (e: any) => {
                        e.stopPropagation(); // 이벤트 전파 방지
                        e.preventDefault(); // 기본 동작 방지
                        isButtonClick = true; // 버튼 클릭 플래그 설정
                        
                        // 면적 오버레이 삭제 (측정 결과 텍스트)
                        if (areaOverlay) {
                            areaOverlay.setMap(null);
                            const areaOverlayIndex = kakaoDrawingRef.current.overlays.indexOf(areaOverlay);
                            if (areaOverlayIndex > -1) {
                                kakaoDrawingRef.current.overlays.splice(areaOverlayIndex, 1);
                            }
                        }
                    };
                    textCloseBtn.addEventListener('mousedown', (e: any) => { e.stopPropagation(); e.preventDefault(); }, true);
                    textCloseBtn.addEventListener('mouseup', (e: any) => { e.stopPropagation(); e.preventDefault(); }, true);
                    textCloseBtn.addEventListener('click', handleTextCloseBtnClick, true);
                    
                    // 측정 객체 삭제 버튼 이벤트 처리 (mousedown, mouseup, click 모두 처리)
                    const handleDeleteBtnClick = (e: any) => {
                        e.stopPropagation(); // 이벤트 전파 방지
                        e.preventDefault(); // 기본 동작 방지
                        isButtonClick = true; // 버튼 클릭 플래그 설정
                        
                        // 폴리곤 삭제 (저장된 참조 사용)
                        if (savedCurrentPoly) {
                            savedCurrentPoly.setMap(null);
                            // polygons 배열에서도 제거
                            const index = kakaoDrawingRef.current.polygons.indexOf(savedCurrentPoly);
                            if (index > -1) {
                                kakaoDrawingRef.current.polygons.splice(index, 1);
                            }
                        }
                        // 면적 오버레이도 삭제 (측정 결과 텍스트)
                        if (areaOverlay) {
                            areaOverlay.setMap(null);
                            const areaOverlayIndex = kakaoDrawingRef.current.overlays.indexOf(areaOverlay);
                            if (areaOverlayIndex > -1) {
                                kakaoDrawingRef.current.overlays.splice(areaOverlayIndex, 1);
                            }
                        }
                        // 도형 삭제 버튼 오버레이도 삭제
                        if (deleteBtnOverlay) {
                            deleteBtnOverlay.setMap(null);
                            const deleteBtnOverlayIndex = kakaoDrawingRef.current.overlays.indexOf(deleteBtnOverlay);
                            if (deleteBtnOverlayIndex > -1) {
                                kakaoDrawingRef.current.overlays.splice(deleteBtnOverlayIndex, 1);
                            }
                        }
                    };
                    deleteBtn.addEventListener('mousedown', (e: any) => { e.stopPropagation(); e.preventDefault(); }, true);
                    deleteBtn.addEventListener('mouseup', (e: any) => { e.stopPropagation(); e.preventDefault(); }, true);
                    deleteBtn.addEventListener('click', handleDeleteBtnClick, true);
                    
                    currentPoly = null;
                    map.setCursor('default');
                }
            }
        };

        window.kakao.maps.event.addListener(map, 'click', handleClick);
        window.kakao.maps.event.addListener(map, 'mousemove', handleMouseMove);
        window.kakao.maps.event.addListener(map, 'rightclick', handleRightClick);
        
        kakaoDrawingRef.current.listeners.push(
            () => window.kakao.maps.event.removeListener(map, 'click', handleClick),
            () => window.kakao.maps.event.removeListener(map, 'mousemove', handleMouseMove),
            () => window.kakao.maps.event.removeListener(map, 'rightclick', handleRightClick)
        );
    }
  }, [gisMode, config.type]);


  // 5. Actions
  const handleKakaoAction = useCallback((mode: GISMode) => {
     if (config.type !== 'kakao' || !mapRef.current) return;
     
     // 거리뷰가 활성화된 상태에서 로드뷰 버튼을 클릭하면 거리뷰를 닫기
     if (mode === GISMode.ROADVIEW && isStreetViewActive) {
         setIsStreetViewActive(false);
         onStreetViewChange(null); // 거리뷰 상태 초기화 (동기화를 위해)
         if (gisMode === GISMode.ROADVIEW) {
             mapRef.current.removeOverlayMapTypeId(window.kakao.maps.MapTypeId.ROADVIEW);
             if (kakaoGisRef.current.clickHandler) {
                 window.kakao.maps.event.removeListener(mapRef.current, 'click', kakaoGisRef.current.clickHandler);
                 kakaoGisRef.current.clickHandler = null;
             }
             if (kakaoGisRef.current.walkerOverlay) {
                 kakaoGisRef.current.walkerOverlay.setMap(null);
                 kakaoGisRef.current.walkerOverlay = null;
             }
             if (kakaoGisRef.current.directionPolygon) {
                 kakaoGisRef.current.directionPolygon.setMap(null);
                 kakaoGisRef.current.directionPolygon = null;
             }
             kakaoGisRef.current.polygonState = null;
             mapRef.current.setCursor('default');
             setGisMode(GISMode.DEFAULT);
         }
         return;
     }
     
     // 토글 모드: 같은 모드를 다시 클릭하면 DEFAULT로 변경
     if (gisMode === mode) {
         // 거리/면적 측정 모드인 경우 토글하여 끄기
         if (mode === GISMode.DISTANCE || mode === GISMode.AREA) {
             setGisMode(GISMode.DEFAULT);
             mapRef.current.setCursor('default');
             // 측정 중인 리소스 정리
             clearKakaoDrawingResources();
             return;
         }
         // 로드뷰 모드인 경우도 토글
         if (mode === GISMode.ROADVIEW) {
             mapRef.current.removeOverlayMapTypeId(window.kakao.maps.MapTypeId.ROADVIEW);
             if (kakaoGisRef.current.clickHandler) {
                 window.kakao.maps.event.removeListener(mapRef.current, 'click', kakaoGisRef.current.clickHandler);
                 kakaoGisRef.current.clickHandler = null;
             }
             if (kakaoGisRef.current.walkerOverlay) {
                 kakaoGisRef.current.walkerOverlay.setMap(null);
                 kakaoGisRef.current.walkerOverlay = null;
             }
             mapRef.current.setCursor('default');
             setGisMode(GISMode.DEFAULT);
             return;
         }
     }
     
     // Reset previous Road View mode if active
     if (gisMode === GISMode.ROADVIEW && mode !== GISMode.ROADVIEW) {
         mapRef.current.removeOverlayMapTypeId(window.kakao.maps.MapTypeId.ROADVIEW);
         if (kakaoGisRef.current.clickHandler) {
             window.kakao.maps.event.removeListener(mapRef.current, 'click', kakaoGisRef.current.clickHandler);
             kakaoGisRef.current.clickHandler = null;
         }
         if (kakaoGisRef.current.walkerOverlay) {
             kakaoGisRef.current.walkerOverlay.setMap(null);
             kakaoGisRef.current.walkerOverlay = null;
         }
     }
     
     // Reset previous Distance/Area mode if active
     if ((gisMode === GISMode.DISTANCE || gisMode === GISMode.AREA) && mode !== gisMode) {
         mapRef.current.setCursor('default');
         // 측정 중인 리소스 정리
         clearKakaoDrawingResources();
     }
     
     mapRef.current.setCursor('default');

     if (mode === GISMode.ROADVIEW) {
       mapRef.current.addOverlayMapTypeId(window.kakao.maps.MapTypeId.ROADVIEW);
       mapRef.current.setCursor('crosshair');
       
       const clickHandler = (e: any) => {
         const pos = e.latLng;
         kakaoGisRef.current.rvClient.getNearestPanoId(pos, 50, (panoId: any) => {
           if (panoId) {
             setIsStreetViewActive(true); 
             setTimeout(() => {
               if (roadviewRef.current) {
                 const rv = new window.kakao.maps.Roadview(roadviewRef.current);
                 rv.setPanoId(panoId, pos);
                 kakaoGisRef.current.rv = rv;

                 // 미니맵 중앙으로 이동 및 지도 리사이즈
                 mapRef.current.setCenter(pos);
                 mapRef.current.relayout(); // 미니맵 전환 후 리사이즈 필수
                 
                 // 거리뷰 상태 업데이트 (동기화를 위해)
                 onStreetViewChange({ lat: pos.getLat(), lng: pos.getLng(), active: true });
                 
                 // 지도 리사이즈 완료 후 Walker 생성 (컨테이너 크기 변경 대기)
                 setTimeout(() => {
                   // 초기 viewpoint 각도 가져오기
                   const initialViewpoint = rv.getViewpoint();
                   const initialAngle = initialViewpoint ? initialViewpoint.pan : 0;
                   
                   // Walker 생성 또는 업데이트 (초기 각도 포함, 중복 방지)
                   // 기존 walker가 있으면 완전히 제거 후 재생성
                   if (kakaoGisRef.current.walkerOverlay) {
                     try {
                       kakaoGisRef.current.walkerOverlay.setMap(null);
                     } catch (e) {
                       // 이미 제거된 경우 무시
                     }
                     kakaoGisRef.current.walkerOverlay = null;
                   }
                   // 새로운 walker 생성
                   createKakaoWalker(pos, mapRef.current, initialAngle);
                   
                   // 위치 변경 이벤트 리스너 (중복 방지)
                   if (kakaoGisRef.current.rv) {
                     window.kakao.maps.event.removeListener(kakaoGisRef.current.rv, 'position_changed');
                     window.kakao.maps.event.removeListener(kakaoGisRef.current.rv, 'viewpoint_changed');
                   }
                   
                  const positionListener = () => {
                    const rvPos = rv.getPosition();
                    const viewpoint = rv.getViewpoint();
                    isDragging.current = true; 
                    
                    // Sync Map Center - 미니맵 중앙으로 이동
                    try {
                      const currentZoom = mapRef.current && typeof mapRef.current.getLevel === 'function' 
                        ? kakaoToZoom(mapRef.current.getLevel()) 
                        : globalState.zoom;
                      const lat = rvPos.getLat();
                      const lng = rvPos.getLng();
                      
                      // 미니맵 중앙으로 이동
                      if (mapRef.current) {
                        mapRef.current.setCenter(rvPos);
                      }
                      onStateChange({ lat, lng, zoom: currentZoom });
                    } catch (error) {
                      console.error('Kakao Roadview sync error:', error);
                    }
                    
                    // 거리뷰 상태 업데이트 (동기화를 위해)
                    onStreetViewChange({ lat: rvPos.getLat(), lng: rvPos.getLng(), active: true });
                    
                    // Sync Walker - 미니맵 중앙에 위치
                    if (kakaoGisRef.current.walkerOverlay && mapRef.current) {
                      // walker 위치 업데이트
                      kakaoGisRef.current.walkerOverlay.setPosition(rvPos);
                      kakaoGisRef.current.walkerOverlay.setMap(mapRef.current);
                      // walker 위치 업데이트 직후 폴리곤도 같은 위치로 업데이트 (동기화 보장)
                      if (viewpoint) {
                        createKakaoDirectionPolygon(rvPos, viewpoint.pan, mapRef.current);
                      }
                    }

                    setTimeout(() => isDragging.current = false, 200);
                  };
                   
                  const viewpointListener = () => {
                    const viewpoint = rv.getViewpoint();
                    const rvPos = rv.getPosition();
                    if (kakaoGisRef.current.walkerOverlay) {
                      const content = kakaoGisRef.current.walkerOverlay.getContent();
                      if (content) {
                        content.style.transformOrigin = 'center center'; // 회전 중심을 중앙으로 설정 (방향 비추기)
                        content.style.transform = `rotate(${viewpoint.pan}deg)`;
                      }
                      // Walker 위치도 거리뷰 위치와 동기화
                      if (rvPos && mapRef.current) {
                        kakaoGisRef.current.walkerOverlay.setPosition(rvPos);
                        kakaoGisRef.current.walkerOverlay.setMap(mapRef.current);
                        // walker 위치 업데이트 직후 폴리곤도 같은 위치로 업데이트 (동기화 보장)
                        createKakaoDirectionPolygon(rvPos, viewpoint.pan, mapRef.current);
                      }
                    }
                  };
                   
                   window.kakao.maps.event.addListener(rv, 'position_changed', positionListener);
                   window.kakao.maps.event.addListener(rv, 'viewpoint_changed', viewpointListener);
                 }, 400); // 컨테이너 크기 변경 완료 대기 (350ms 트랜지션 + 여유)
               }
             }, 300);
           }
         });
       };
       
       kakaoGisRef.current.clickHandler = clickHandler;
       window.kakao.maps.event.addListener(mapRef.current, 'click', clickHandler);
     }

     setGisMode(mode);
  }, [config.type, gisMode, isStreetViewActive, onStreetViewChange]);

  const toggleKakaoCadastral = useCallback(() => {
    if (config.type !== 'kakao' || !mapRef.current) return;
    const isCadastral = kakaoGisRef.current.roadviewLayer;
    if (isCadastral) mapRef.current.removeOverlayMapTypeId(window.kakao.maps.MapTypeId.USE_DISTRICT);
    else mapRef.current.addOverlayMapTypeId(window.kakao.maps.MapTypeId.USE_DISTRICT);
    kakaoGisRef.current.roadviewLayer = !isCadastral;
  }, [config.type]);

  const toggleNaverStreetLayer = useCallback(() => {
    if (!mapRef.current || !naverStreetLayerRef.current) return;
    
    // Toggle State and Ref for Sync
    const nextState = !isNaverLayerOn;
    setIsNaverLayerOn(nextState);

    if (nextState) {
        naverStreetLayerRef.current.setMap(mapRef.current);
        mapRef.current.setCursor('crosshair');
    } else {
        naverStreetLayerRef.current.setMap(null);
        mapRef.current.setCursor('default');
    }
  }, [isNaverLayerOn]);

  const clearKakaoDrawingResources = () => {
      try {
        kakaoDrawingRef.current.polylines.forEach(p => {
          try {
            if (p && typeof p.setMap === 'function') {
              p.setMap(null);
            }
          } catch (e) {}
        });
        kakaoDrawingRef.current.polygons.forEach(p => {
          try {
            if (p && typeof p.setMap === 'function') {
              p.setMap(null);
            }
          } catch (e) {}
        });
        kakaoDrawingRef.current.overlays.forEach(o => {
          try {
            if (o && typeof o.setMap === 'function') {
              o.setMap(null);
            }
          } catch (e) {}
        });
        kakaoDrawingRef.current.listeners.forEach(fn => {
          try {
            if (typeof fn === 'function') {
              fn();
            }
          } catch (error) {
            // 이미 제거된 리스너인 경우 무시
          }
        });
        kakaoDrawingRef.current = { polylines: [], polygons: [], overlays: [], listeners: [] };
      } catch (e) {
        console.warn('clearKakaoDrawingResources error:', e);
      }
  };

  const closeStreetView = () => {
    setIsStreetViewActive(false);
    onStreetViewChange(null); // 거리뷰 상태 초기화 (동기화를 위해)
    if (config.type === 'google') {
      if (googlePanoInstanceRef.current) googlePanoInstanceRef.current.setVisible(false);
      if (googleCoverageLayerRef.current) googleCoverageLayerRef.current.setMap(null);
    }
    // Fix: Clean up Kakao Roadview overlays/handlers
    if (config.type === 'kakao' && mapRef.current) {
      if (gisMode === GISMode.ROADVIEW) {
          mapRef.current.removeOverlayMapTypeId(window.kakao.maps.MapTypeId.ROADVIEW);
          if (kakaoGisRef.current.clickHandler) {
              window.kakao.maps.event.removeListener(mapRef.current, 'click', kakaoGisRef.current.clickHandler);
              kakaoGisRef.current.clickHandler = null;
          }
          if (kakaoGisRef.current.walkerOverlay) {
              kakaoGisRef.current.walkerOverlay.setMap(null);
              kakaoGisRef.current.walkerOverlay = null;
          }
          if (kakaoGisRef.current.directionPolygon) {
              kakaoGisRef.current.directionPolygon.setMap(null);
              kakaoGisRef.current.directionPolygon = null;
          }
          // polygonState 초기화 (줌 변경 시 폴리곤이 재생성되지 않도록)
          kakaoGisRef.current.polygonState = null;
          mapRef.current.setCursor('default');
          setGisMode(GISMode.DEFAULT);
      }
    }
    // Fix: Clean up Naver
    if (config.type === 'naver') {
        if (naverPanoramaRef.current) {
            // 파노라마 인스턴스는 유지하되 컨테이너에서 제거하지 않음 (재사용을 위해)
            // 대신 마커만 제거
        }
        if (naverMarkerRef.current) {
            naverMarkerRef.current.setMap(null);
            // 마커는 유지 (다음에 다시 사용할 수 있도록)
        }
        if (naverDirectionPolygonRef.current) {
            naverDirectionPolygonRef.current.setMap(null);
            naverDirectionPolygonRef.current = null;
        }
        // blob URL 캐시 정리 (마커가 완전히 제거된 후에만 revoke)
        if (naverMarkerIconUrlCacheRef.current) {
          naverMarkerIconUrlCacheRef.current.forEach((url) => {
            try {
              URL.revokeObjectURL(url);
            } catch (e) {
              // 이미 revoke된 경우 무시
            }
          });
          naverMarkerIconUrlCacheRef.current.clear();
        }
        if (naverMarkerIconUrlRef.current) {
            naverMarkerIconUrlRef.current = null;
        }
    }
  };

  return (
    <div className="w-full h-full relative group bg-gray-50 overflow-hidden">
      {/* 1. Main Map / Mini Map Container */}
      <div 
        ref={containerRef} 
        className={`transition-all duration-300 ease-in-out bg-white
          ${isStreetViewActive 
            ? 'absolute w-[240px] h-[240px] z-[9999] border-4 border-white shadow-2xl rounded-lg overflow-hidden' 
            : 'w-full h-full z-0'
          }`}
        style={isStreetViewActive ? {
          position: 'absolute',
          bottom: '12px',  // bottom-3 = 0.75rem = 12px
          left: '12px',    // left-3 = 0.75rem = 12px
          top: 'auto',
          right: 'auto',
          width: '240px',
          height: '240px'
        } : {}}
      />

      {/* 2. Street View Containers */}
      <div 
        ref={googlePanoRef}
        className={`absolute bg-black transition-opacity duration-300 
           ${config.type === 'google' && isStreetViewActive ? 'z-10 opacity-100 pointer-events-auto' : 'z-[-1] opacity-0 pointer-events-none'}`}
        style={{
          position: 'absolute',
          top: '0',
          left: '0',
          right: '0',
          bottom: '0',
          width: '100%',
          height: '100%',
          margin: 0,
          padding: 0,
          boxSizing: 'border-box',
          display: config.type === 'google' ? 'block' : 'none'
        }}
      />

      <div 
        ref={roadviewRef}
        className={`absolute inset-0 bg-black transition-opacity duration-300 
           ${config.type === 'kakao' && isStreetViewActive ? 'z-10 opacity-100 pointer-events-auto' : 'z-[-1] opacity-0 pointer-events-none'}`} 
      />

      <div 
        ref={naverPanoContainerRef}
        className={`absolute bg-black transition-opacity duration-300 
           ${config.type === 'naver' && isStreetViewActive ? 'z-[1] opacity-100 pointer-events-auto' : 'z-[-1] opacity-0 pointer-events-none'}`}
        style={{
          position: 'absolute',
          top: '0',
          left: '0',
          right: '0',
          bottom: '0',
          width: '100%',
          height: '100%',
          margin: 0,
          padding: 0,
          boxSizing: 'border-box',
          display: config.type === 'naver' ? 'block' : 'none'
        }}
      />

      {/* 3. Close Button (Square Icon) - 모든 맵에서 우상단 */}
      {isStreetViewActive && (
        <button 
          onClick={closeStreetView}
          className="absolute z-[9999] bg-white text-gray-800 p-1.5 flex items-center justify-center shadow-lg rounded hover:bg-gray-100 transition-colors border border-gray-300 top-4 right-4"
          title="거리뷰 닫기"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      )}

      {/* 4. Loading & Controls */}
      {!sdkLoaded && (
         <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-[120] text-gray-500">
            <span>Loading...</span>
         </div>
      )}

       {/* 전체화면 버튼 - 모든 맵에서 우상단, 거리뷰 활성화 시 오른쪽으로 이동 */}
       <button 
         onClick={onToggleFullscreen}
         className={`absolute z-[9999] bg-white p-1.5 rounded shadow border border-gray-300 hover:bg-gray-50 transition-colors top-4 ${
           isStreetViewActive 
             ? config.type === 'naver'
               ? 'right-[50px]'  // 네이버: 거리뷰 버튼(16px) + 간격(2px) + 버튼(32px) = 50px
               : 'right-[50px]'  // 카카오/구글: 거리뷰 닫기(16px) + 간격(2px) + 버튼(32px) = 50px
             : config.type === 'google'
               ? 'right-16'  // 구글맵 pegman 옆에 배치
               : config.type === 'naver'
                 ? 'right-4'  // 네이버맵: 오른쪽 상단 (거리뷰 버튼과 위치 교체)
                 : 'right-4'   // 카카오맵
         }`}
         title="전체화면"
       >
        {isFullscreen ? (
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current text-gray-700"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>
        ) : (
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current text-gray-700"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
        )}
      </button>
      
      {/* 네이버 거리뷰 버튼 - 우상단 배치 (거리뷰 활성화 상태에서도 표시) */}
      {config.type === 'naver' && (
        <button 
          onClick={isStreetViewActive ? closeStreetView : toggleNaverStreetLayer} 
          className={`absolute top-4 ${isStreetViewActive ? 'right-4' : 'right-[50px]'} z-[9999] p-1.5 flex items-center justify-center rounded shadow border transition-colors ${isStreetViewActive || isNaverLayerOn ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
          title={isStreetViewActive ? '거리뷰 닫기' : (isNaverLayerOn ? '거리뷰 끄기' : '거리뷰 켜기')}
        >
          <img src="/streetview-icon.png" alt="거리뷰" className="w-5 h-5 object-contain" />
        </button>
      )}
      
      {config.type === 'kakao' && (
        <KakaoGisToolbar 
          activeMode={gisMode} 
          onAction={handleKakaoAction} 
          onToggleCadastral={toggleKakaoCadastral} 
          isStreetViewActive={isStreetViewActive}
          onClear={() => {
              setGisMode(GISMode.DEFAULT);
              if (mapRef.current) {
                mapRef.current.removeOverlayMapTypeId(window.kakao.maps.MapTypeId.ROADVIEW);
                mapRef.current.removeOverlayMapTypeId(window.kakao.maps.MapTypeId.USE_DISTRICT);
                mapRef.current.setCursor('default');
              }
              kakaoGisRef.current.roadviewLayer = false;
              if (kakaoGisRef.current.walkerOverlay) {
                  kakaoGisRef.current.walkerOverlay.setMap(null);
                  kakaoGisRef.current.walkerOverlay = null;
              }
              clearKakaoDrawingResources();
            }}
        />
      )}
      
      {/* 🆕 길찾기 버튼 */}
      <button
        onClick={() => setIsRoutingPanelOpen(!isRoutingPanelOpen)}
        className={`absolute top-20 ${config.type === 'naver' ? 'right-[150px]' : 'right-[50px]'} z-[9999] p-1.5 flex items-center justify-center rounded shadow border transition-colors ${
          isRoutingPanelOpen ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
        }`}
        title="길찾기"
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg>
      </button>
      
      {/* 🆕 길찾기 패널 */}
      {isRoutingPanelOpen && (
        <RoutingPanel
          onCalculate={async (origin, destination, waypoints) => {
            try {
              const routes = await routingManagerRef.current.calculateRouteFromPlaces(
                origin,
                destination,
                waypoints
              );
              routingManagerRef.current.displayRoutes(routes);
            } catch (error) {
              console.error('Route calculation failed:', error);
              alert('경로를 찾을 수 없습니다. 출발지와 목적지를 확인해주세요.');
            }
          }}
          onClose={() => {
            setIsRoutingPanelOpen(false);
            routingManagerRef.current.clearRoutes();
          }}
        />
      )}
    </div>
  );
};

export default MapPane;
