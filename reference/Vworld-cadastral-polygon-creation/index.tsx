import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Layers, Map as MapIcon } from 'lucide-react';
import proj4 from 'proj4'; // npm install proj4 @types/proj4

/**
 * [API KEY 설정]
 * 도메인 제한이 걸려 있으므로 키를 직접 코드에 입력합니다.
 */
const VWORLD_KEY = '80DCE32C-9A0E-359B-BF0A-9FD4E8D4D285';
const KAKAO_API_KEY = '8d2d116d6a534a98e73133808f5843a6';

// 허용된 도메인 (VWorld API 호출 시 필요)
const ALLOWED_DOMAIN = 'https://cadapol.vercel.app/';

const App = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<any>(null);
  const [baseLayer, setBaseLayer] = useState<'ROADMAP' | 'SKYVIEW'>('ROADMAP');
  // 지적도 중첩(showCadastral) State 제거됨
  
  // 지도 객체 관리를 위한 ref
  const markerRef = useRef<any>(null);
  const polygonRef = useRef<any>(null);
  const overlayRef = useRef<any>(null);

  useEffect(() => {
    // API 키 누락 경고 (콘솔 확인용)
    if (!VWORLD_KEY) console.warn("⚠️ Warning: VWORLD_API_KEY is missing!");
    if (!KAKAO_API_KEY) console.error("❌ Error: KAKAO_API_KEY is missing!");

    // 카카오맵 SDK 로드 및 초기화
    const loadKakaoMap = () => {
        const scriptId = 'kakao-map-sdk';
        
        if (document.getElementById(scriptId)) {
            if ((window as any).kakao && (window as any).kakao.maps) {
                initMapInstance();
            } else {
                setTimeout(initMapInstance, 500); 
            }
            return;
        }

        if (!KAKAO_API_KEY) return;

        const script = document.createElement('script');
        script.id = scriptId;
        script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_API_KEY}&libraries=services,clusterer,drawing&autoload=false`;
        script.async = true;
        script.onload = () => initMapInstance();
        document.head.appendChild(script);
    };

    const initMapInstance = () => {
      const kakao = (window as any).kakao;
      if (kakao && kakao.maps) {
        kakao.maps.load(() => {
          if (!mapContainer.current) return;
          try {
            const options = {
              center: new kakao.maps.LatLng(37.5665, 126.9780),
              level: 3
            };
            const kakaoMap = new kakao.maps.Map(mapContainer.current, options);
            setMap(kakaoMap);
            
            // 지도 클릭 이벤트 등록
            kakao.maps.event.addListener(kakaoMap, 'click', (mouseEvent: any) => {
              handleMapClick(mouseEvent.latLng, kakaoMap);
            });
          } catch (e) {
            console.error("Map initialization failed:", e);
          }
        });
      }
    };

    loadKakaoMap();
  }, []);

  // 기존 그래픽(마커, 폴리곤, 오버레이) 제거
  const clearGraphics = () => {
    if (markerRef.current) {
      markerRef.current.setMap(null);
      markerRef.current = null;
    }
    if (polygonRef.current) {
      polygonRef.current.setMap(null);
      polygonRef.current = null;
    }
    if (overlayRef.current) {
      overlayRef.current.setMap(null);
      overlayRef.current = null;
    }
  };

  const handleMapClick = (latlng: any, currentMap: any) => {
    const kakao = (window as any).kakao;
    if (!currentMap || !kakao) return;

    clearGraphics();

    // 1. 클릭 위치에 마커 표시
    const marker = new kakao.maps.Marker({ position: latlng });
    marker.setMap(currentMap);
    markerRef.current = marker;

    // 2. 주소 변환 및 커스텀 오버레이(InfoWindow) 표시
    const geocoder = new kakao.maps.services.Geocoder();
    geocoder.coord2Address(latlng.getLng(), latlng.getLat(), (result: any, status: any) => {
      if (status === kakao.maps.services.Status.OK) {
        const roadAddr = result[0].road_address ? result[0].road_address.address_name : '';
        const jibunAddr = result[0].address ? result[0].address.address_name : '';
        const mainAddr = roadAddr || jibunAddr;
        const subAddr = roadAddr ? jibunAddr : '';
        
        const lat = latlng.getLat().toFixed(7);
        const lng = latlng.getLng().toFixed(7);
        
        // 커스텀 오버레이 디자인 (말풍선 스타일)
        const content = `
          <div style="
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
          ">
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

            <div style="
              position: absolute; bottom: -6px; left: 50%; transform: translateX(-50%) rotate(45deg);
              width: 12px; height: 12px; background: rgba(255, 255, 255, 0.95);
              border-bottom: 1px solid rgba(0,0,0,0.1); border-right: 1px solid rgba(0,0,0,0.1);
            "></div>
          </div>
          <style>@keyframes fadeIn { from { opacity: 0; transform: translateY(-40px); } to { opacity: 1; transform: translateY(-45px); } }</style>
        `;

        const overlay = new kakao.maps.CustomOverlay({
          content: content,
          map: currentMap,
          position: latlng,
          yAnchor: 1,
          zIndex: 100
        });

        overlayRef.current = overlay;
      }
    });

    // 3. 지적 정보 호출 (PNU 조회 -> 폴리곤 생성)
    fetchCadastralInfoStep1(latlng.getLng(), latlng.getLat(), currentMap);
  };

  /**
   * [1단계] 좌표로 PNU 조회
   */
  const fetchCadastralInfoStep1 = (lng: number, lat: number, currentMap: any) => {
    if (!VWORLD_KEY) return;

    const callbackName = `vworld_step1_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    
    (window as any)[callbackName] = (data: any) => {
      delete (window as any)[callbackName];
      document.getElementById(callbackName)?.remove();

      if (data.response && data.response.status === 'OK' && data.response.result.featureCollection.features.length > 0) {
        const feature = data.response.result.featureCollection.features[0];
        const pnu = feature.properties.pnu;
        
        // 2단계: PNU로 폴리곤 조회 호출
        if (pnu) {
          fetchGeometryByPNUStep2(pnu, currentMap);
        }
      }
    };

    const script = document.createElement('script');
    script.id = callbackName;
    script.src = `https://api.vworld.kr/req/data?service=data&request=GetFeature&data=LP_PA_CBND_BUBUN&key=${VWORLD_KEY}&geomFilter=POINT(${lng} ${lat})&domain=${encodeURIComponent(ALLOWED_DOMAIN)}&crs=EPSG:4326&format=json&errorFormat=json&geometry=false&callback=${callbackName}`;
    script.onerror = () => {
      delete (window as any)[callbackName];
      document.getElementById(callbackName)?.remove();
    };
    document.body.appendChild(script);
  };

  /**
   * [2단계] PNU로 정확한 폴리곤 Geometry 조회 및 그리기
   */
  const fetchGeometryByPNUStep2 = (pnu: string, currentMap: any) => {
    const callbackName = `vworld_step2_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    
    (window as any)[callbackName] = (data: any) => {
      delete (window as any)[callbackName];
      document.getElementById(callbackName)?.remove();

      if (data.response && data.response.status === 'OK' && data.response.result.featureCollection.features.length > 0) {
        const feature = data.response.result.featureCollection.features[0];
        if (feature.geometry) {
          drawParcelPolygon(feature.geometry, currentMap);
        }
      }
    };

    const script = document.createElement('script');
    script.id = callbackName;
    script.src = `https://api.vworld.kr/req/data?service=data&request=GetFeature&data=LP_PA_CBND_BUBUN&key=${VWORLD_KEY}&attrFilter=pnu:=:${pnu}&domain=${encodeURIComponent(ALLOWED_DOMAIN)}&crs=EPSG:4326&format=json&errorFormat=json&geometry=true&callback=${callbackName}`;
    document.body.appendChild(script);
  };

  const drawParcelPolygon = (geometry: any, currentMap: any) => {
    const kakao = (window as any).kakao;
    if (!currentMap || !kakao || !geometry) return;

    let paths: any[] = [];
    
    // Proj4를 이용한 좌표계 변환 및 파싱
    const parsePolygon = (coordinates: any[]) => {
      if (!coordinates || coordinates.length === 0) return [];
      
      const firstPoint = coordinates[0][0];
      let isTM = firstPoint[0] > 180 || firstPoint[1] > 90; // EPSG:5179 감지

      if (isTM) {
        try {
            if (proj4) {
                 proj4.defs("EPSG:5179", "+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs");
                 const proj = proj4("EPSG:5179", "EPSG:4326");
                 return coordinates.map((ring: number[][]) => 
                   ring.map(coord => {
                     const [lon, lat] = proj.forward([coord[0], coord[1]]);
                     return new kakao.maps.LatLng(lat, lon);
                   })
                 );
            }
            return [];
        } catch(e) { return []; }
      } else {
        return coordinates.map((ring: number[][]) => 
          ring.map(coord => new kakao.maps.LatLng(coord[1], coord[0]))
        );
      }
    };

    try {
      if (geometry.type === 'Polygon') {
        paths = parsePolygon(geometry.coordinates);
      } else if (geometry.type === 'MultiPolygon') {
        geometry.coordinates.forEach((polyCoords: any[]) => {
          paths = [...paths, ...parsePolygon(polyCoords)];
        });
      }
    } catch (e) {
      console.error("Geometry parsing error", e);
      return;
    }

    if (paths.length > 0) {
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
      polygonRef.current = polygon;
    }
  };

  const toggleBaseMap = (type: 'ROADMAP' | 'SKYVIEW') => {
    if (!map) return;
    const kakao = (window as any).kakao;
    map.setMapTypeId(type === 'ROADMAP' ? kakao.maps.MapTypeId.ROADMAP : kakao.maps.MapTypeId.HYBRID);
    setBaseLayer(type);
  };

  // 지적도 중첩 제어 useEffect 제거됨

  return (
    <div className="relative w-full h-full bg-slate-900 font-sans">
      {/* Map Main */}
      <div ref={mapContainer} className="w-full h-full z-0" />

      {/* Floating Controls */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-3 z-50">
        <div className="glass-morphism flex rounded-2xl shadow-2xl overflow-hidden p-1.5 border border-white/30 backdrop-blur-md">
          <button 
            onClick={() => toggleBaseMap('ROADMAP')}
            className={`px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all duration-300 ${baseLayer === 'ROADMAP' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/40' : 'text-slate-600 hover:bg-white/50'}`}
          >
            <MapIcon className="w-4 h-4" /> 일반
          </button>
          <button 
            onClick={() => toggleBaseMap('SKYVIEW')}
            className={`px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all duration-300 ${baseLayer === 'SKYVIEW' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/40' : 'text-slate-600 hover:bg-white/50'}`}
          >
            <Layers className="w-4 h-4" /> 위성
          </button>
        </div>
        {/* 지적도 버튼 제거됨 */}
      </div>

      <style>{`
        .glass-morphism {
          background: rgba(255, 255, 255, 0.75);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
      `}</style>
    </div>
  );
};

const root = createRoot(document.getElementById('app')!);
root.render(<App />);