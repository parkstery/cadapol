import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Layers, Info, Layers as LayerIcon, Map as MapIcon, X, ChevronRight, Activity, MapPin, Copy, Search } from 'lucide-react';
import proj4 from 'proj4'; // npm install proj4 @types/proj4

/**
 * 환경 설정: VWorld API 키 및 도메인
 * 주의: VWorld API 키는 해당 도메[](https://cadapol.vercel.app/)에 등록되어 있어야 합니다.
 */
const VWORLD_KEY = '04FADF88-BBB0-3A72-8404-479547569E44'; 
const ALLOWED_DOMAIN = 'https://cadapol.vercel.app/';

const App = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<any>(null);
  const [baseLayer, setBaseLayer] = useState<'ROADMAP' | 'SKYVIEW'>('ROADMAP');
  const [showCadastral, setShowCadastral] = useState(false);
  const [selectedInfo, setSelectedInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // 지도 객체 관리를 위한 ref
  const markerRef = useRef<any>(null);
  const polygonRef = useRef<any>(null);
  const overlayRef = useRef<any>(null);

  useEffect(() => {
    console.log("App Initializing..."); // Cache Busting Log
    let retryCount = 0;
    const maxRetries = 50;

    const initMap = () => {
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
            // 중요: 여기서 kakaoMap 인스턴스를 핸들러에 전달하여 클로저 문제 해결
            kakao.maps.event.addListener(kakaoMap, 'click', (mouseEvent: any) => {
              handleMapClick(mouseEvent.latLng, kakaoMap);
            });
          } catch (e) {
            console.error("Map initialization failed:", e);
          }
        });
      } else if (retryCount < maxRetries) {
        retryCount++;
        setTimeout(initMap, 100);
      }
    };
    initMap();
  }, []);

  // 기존에 그려진 마커, 폴리곤, 오버레이 제거
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

    // 2. 주소 변환 및 커스텀 오버레이(윈도우 텍스트창) 표시
    const geocoder = new kakao.maps.services.Geocoder();
    geocoder.coord2Address(latlng.getLng(), latlng.getLat(), (result: any, status: any) => {
      if (status === kakao.maps.services.Status.OK) {
        const roadAddr = result[0].road_address ? result[0].road_address.address_name : '';
        const jibunAddr = result[0].address ? result[0].address.address_name : '';
        const mainAddr = roadAddr || jibunAddr;
        const subAddr = roadAddr ? jibunAddr : '';
        
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
            max-width: 260px;
            transform: translateY(-40px);
            animation: fadeIn 0.3s ease-out;
          ">
            <div style="font-size: 11px; color: #3b82f6; font-weight: 700; text-transform: uppercase; margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
              <span style="width: 6px; height: 6px; background: #3b82f6; border-radius: 50%;"></span>
              Selected Location
            </div>
            <div style="font-size: 14px; font-weight: 700; color: #1e293b; line-height: 1.4; word-break: keep-all;">
              ${mainAddr}
            </div>
            ${subAddr ? `<div style="font-size: 12px; color: #64748b; margin-top: 2px;">(지번) ${subAddr}</div>` : ''}
            
            <!-- 말풍선 꼬리 -->
            <div style="
              position: absolute;
              bottom: -6px;
              left: 50%;
              transform: translateX(-50%) rotate(45deg);
              width: 12px;
              height: 12px;
              background: rgba(255, 255, 255, 0.95);
              border-bottom: 1px solid rgba(0,0,0,0.1);
              border-right: 1px solid rgba(0,0,0,0.1);
            "></div>
          </div>
          <style>
            @keyframes fadeIn {
              from { opacity: 0; transform: translateY(-35px); }
              to { opacity: 1; transform: translateY(-40px); }
            }
          </style>
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

    // 3. 지적 정보 데이터 호출 (2단계 방식: PNU 조회 -> Geometry 조회)
    fetchCadastralInfoStep1(latlng.getLng(), latlng.getLat(), currentMap);
  };

  /**
   * [1단계] 클릭한 위치(POINT)로 PNU 및 속성 정보를 조회합니다.
   * Advisor Note: POINT 쿼리는 Geometry 반환이 불안정하므로 속성(PNU) 획득에 집중합니다.
   */
  const fetchCadastralInfoStep1 = (lng: number, lat: number, currentMap: any) => {
    setLoading(true);
    setSidebarOpen(true);
    setSelectedInfo(null);

    const callbackName = `vworld_step1_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    
    (window as any)[callbackName] = (data: any) => {
      // 정리
      delete (window as any)[callbackName];
      document.getElementById(callbackName)?.remove();

      console.log('Step1 Response:', data); // 디버깅 로그 추가

      if (data.response && data.response.status === 'OK' && data.response.result.featureCollection.features.length > 0) {
        const feature = data.response.result.featureCollection.features[0];
        const pnu = feature.properties.pnu;
        
        // 속성 정보 설정
        setSelectedInfo({
          pnu: pnu,
          addr: feature.properties.addr,
          jibun: feature.properties.jibun,
          area: feature.properties.area,
          bonbun: feature.properties.bonbun,
          bubun: feature.properties.bubun,
        });

        // 2단계: PNU로 정확한 폴리곤 조회 호출
        if (pnu) {
          fetchGeometryByPNUStep2(pnu, currentMap);
        } else {
            setLoading(false);
        }
      } else {
        setLoading(false);
        setSelectedInfo({ error: '해당 위치의 지적 정보를 찾을 수 없습니다.' });
      }
    };

    const script = document.createElement('script');
    script.id = callbackName;
    // 1단계는 geomFilter=POINT 사용. geometry=true 추가
    script.src = `https://api.vworld.kr/req/data?service=data&request=GetFeature&data=LP_PA_CBND_BUBUN&key=${VWORLD_KEY}&geomFilter=POINT(${lng} ${lat})&domain=${encodeURIComponent(ALLOWED_DOMAIN)}&crs=EPSG:4326&format=json&errorFormat=json&geometry=true&callback=${callbackName}`;
    
    script.onerror = () => {
      setLoading(false);
      setSelectedInfo({ error: '데이터 로드 실패 (네트워크/도메인)' });
      delete (window as any)[callbackName];
      document.getElementById(callbackName)?.remove();
    };

    document.body.appendChild(script);
  };

  /**
   * [2단계] PNU를 사용하여 정확한 Geometry를 조회합니다.
   * Advisor Note: attrFilter=pnu:=:{pnu} 방식을 사용하면 EPSG:4326 좌표계가 더 정확하게 적용된 Geometry를 얻을 수 있습니다.
   */
  const fetchGeometryByPNUStep2 = (pnu: string, currentMap: any) => {
    const callbackName = `vworld_step2_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    
    (window as any)[callbackName] = (data: any) => {
      setLoading(false);
      delete (window as any)[callbackName];
      document.getElementById(callbackName)?.remove();

      console.log('Step2 Response:', data); // 디버깅 로그 추가

      if (data.response && data.response.status === 'OK' && data.response.result.featureCollection.features.length > 0) {
        const feature = data.response.result.featureCollection.features[0];
        
        if (feature.geometry) {
          drawParcelPolygon(feature.geometry, currentMap);
        } else {
           console.warn("PNU query returned no geometry");
           setSelectedInfo((prev: any) => ({ ...prev, error: '경계 데이터가 없습니다.' }));
        }
      } else {
        setSelectedInfo((prev: any) => ({ ...prev, error: '경계 조회 실패' }));
      }
    };

    const script = document.createElement('script');
    script.id = callbackName;
    // attrFilter 사용. pnu가 정확히 일치하는 필지 검색 (= 사용). crs=EPSG:4326 필수. geometry=true 추가.
    script.src = `https://api.vworld.kr/req/data?service=data&request=GetFeature&data=LP_PA_CBND_BUBUN&key=${VWORLD_KEY}&attrFilter=pnu:=:${pnu}&domain=${encodeURIComponent(ALLOWED_DOMAIN)}&crs=EPSG:4326&format=json&errorFormat=json&geometry=true&callback=${callbackName}`;
    
    document.body.appendChild(script);
  };

  const drawParcelPolygon = (geometry: any, currentMap: any) => {
    const kakao = (window as any).kakao;
    
    if (!currentMap || !kakao || !geometry) return;

    let paths: any[] = [];
    
    // GeoJSON 좌표를 Kakao LatLng로 변환하는 헬퍼 함수 (TM 변환 포함)
    const parsePolygon = (coordinates: any[]) => {
      if (!coordinates || coordinates.length === 0) return [];
      
      const firstPoint = coordinates[0][0]; // [x/lng, y/lat]
      let isTM = firstPoint[0] > 180 || firstPoint[1] > 90;

      if (isTM) {
        console.warn("Converting TM (EPSG:5179) to WGS84 (EPSG:4326)");
        proj4.defs("EPSG:5179", "+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs");
        const proj = proj4("EPSG:5179", "EPSG:4326");
        
        // 모든 링 (outer + holes) 변환
        return coordinates.map((ring: number[][]) => 
          ring.map(coord => {
            const [lon, lat] = proj.forward([coord[0], coord[1]]);
            return new kakao.maps.LatLng(lat, lon);
          })
        );
      } else {
        // WGS84: [lng, lat] -> LatLng(lat, lng), 모든 링 처리
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
          const polyPaths = parsePolygon(polyCoords);
          paths = [...paths, ...polyPaths];
        });
      }
    } catch (e) {
      console.error("Geometry parsing error", e);
      setSelectedInfo((prev: any) => ({ ...prev, error: '경계 파싱 오류' }));
      return;
    }

    if (paths.length > 0) {
      const polygon = new kakao.maps.Polygon({
        path: paths, // holes 지원 (LatLng[][])
        strokeWeight: 3,
        strokeColor: '#f97316', // Orange-500
        strokeOpacity: 1,
        strokeStyle: 'solid',
        fillColor: '#f97316',
        fillOpacity: 0.2
      });
      polygon.setMap(currentMap);
      polygonRef.current = polygon;
    } else {
        // 좌표 변환 실패 등으로 path가 비어있을 경우 에러 업데이트
        setSelectedInfo((prev: any) => ({ ...prev, error: '경계 데이터를 지도 좌표로 변환하지 못했습니다.' }));
    }
  };

  const toggleBaseMap = (type: 'ROADMAP' | 'SKYVIEW') => {
    if (!map) return;
    const kakao = (window as any).kakao;
    map.setMapTypeId(type === 'ROADMAP' ? kakao.maps.MapTypeId.ROADMAP : kakao.maps.MapTypeId.HYBRID);
    setBaseLayer(type);
  };

  useEffect(() => {
    if (!map) return;
    const kakao = (window as any).kakao;
    
    if (!kakao || !kakao.maps) return;

    // 카카오맵 지적편집도 상수: USE_DISTRICT
    const cadastralType = kakao.maps.MapTypeId.USE_DISTRICT;

    try {
      if (showCadastral) {
        map.addOverlayMapTypeId(cadastralType);
      } else {
        map.removeOverlayMapTypeId(cadastralType);
      }
    } catch (e) {
      console.error("Failed to toggle cadastral layer:", e);
    }
  }, [showCadastral, map]);

  return (
    <div className="relative w-full h-full flex overflow-hidden bg-slate-900 font-sans">
      {/* Sidebar */}
      <div className={`fixed left-0 top-0 h-full w-80 dark-glass z-50 transition-all duration-300 ease-in-out transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} shadow-2xl flex flex-col`}>
        <div className="p-5 border-b border-white/10 flex justify-between items-center bg-black/20">
          <div className="flex items-center gap-2">
            <Info className="w-5 h-5 text-blue-400" />
            <h2 className="font-bold text-lg text-white">필지 상세 정보</h2>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="p-1.5 hover:bg-white/10 rounded-full text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 gap-4">
              <div className="relative">
                <Activity className="w-10 h-10 text-orange-500 animate-spin" />
                <div className="absolute inset-0 bg-orange-500/20 blur-xl rounded-full animate-pulse"></div>
              </div>
              <p className="text-sm text-slate-300 font-medium">지적 경계 추출 중...</p>
            </div>
          ) : selectedInfo ? (
            selectedInfo.error ? (
              <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-xl text-sm text-red-300 leading-relaxed">
                {selectedInfo.error}
              </div>
            ) : (
              <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2">
                <div className="bg-gradient-to-br from-orange-500/20 to-blue-600/20 border border-white/10 p-5 rounded-2xl shadow-inner group relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-3 opacity-20">
                    <MapIcon className="w-16 h-16 text-white" />
                  </div>
                  <div className="relative flex items-start gap-3">
                    <MapPin className="w-5 h-5 text-orange-400 mt-1 flex-shrink-0" />
                    <div className="space-y-1">
                      <label className="text-[10px] text-orange-300/70 uppercase font-bold tracking-widest">지번 주소</label>
                      <p className="text-lg font-bold text-white leading-snug">{selectedInfo.addr || '정보 없음'}</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <div className="bg-white/5 p-4 rounded-xl border border-white/10 hover:bg-white/10 transition-colors">
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">PNU Code</label>
                      <button className="text-blue-400 hover:text-blue-300"><Copy className="w-3 h-3"/></button>
                    </div>
                    <p className="text-xs font-mono text-blue-200 break-all">{selectedInfo.pnu}</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                      <label className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">면적</label>
                      <p className="text-sm font-bold text-white mt-1">{selectedInfo.area || '0'} <span className="text-[10px] font-normal text-slate-400 ml-1">m²</span></p>
                    </div>
                    <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                      <label className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">지번</label>
                      <p className="text-sm font-bold text-white mt-1">{selectedInfo.jibun}</p>
                    </div>
                  </div>

                  <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">본번 - 부번</label>
                    <p className="text-sm font-bold text-white mt-1">{selectedInfo.bonbun} - {selectedInfo.bubun}</p>
                  </div>
                </div>
              </div>
            )
          ) : (
            <div className="text-center mt-12 p-8 border-2 border-dashed border-white/10 rounded-3xl flex flex-col items-center gap-4">
              <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center">
                <Search className="w-6 h-6 text-slate-500" />
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">지도상의 필지를 클릭하여<br/>지적 정보와 경계를 확인하세요.</p>
            </div>
          )}
        </div>
        <div className="p-5 text-[10px] text-slate-500 text-center border-t border-white/10 bg-black/10 tracking-tight">
          &copy; Kakao Maps & VWorld GIS Data API
        </div>
      </div>

      {/* Map Main */}
      <div className="flex-1 relative">
        <div ref={mapContainer} className="w-full h-full" />

        {/* Floating Controls */}
        <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-3 z-40">
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

          <button 
            onClick={() => setShowCadastral(!showCadastral)}
            className={`glass-morphism px-5 py-2 rounded-2xl shadow-2xl text-sm font-bold flex items-center gap-2 border border-white/30 transition-all duration-300 ${showCadastral ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/40' : 'text-slate-600 hover:bg-white/50'}`}
          >
            <LayerIcon className="w-4 h-4" /> 지적도
          </button>
        </div>

        {!sidebarOpen && (
          <button 
            onClick={() => setSidebarOpen(true)}
            className="absolute left-0 top-1/2 -translate-y-1/2 w-10 h-20 glass-morphism border-y border-r border-white/30 rounded-r-2xl flex items-center justify-center shadow-2xl hover:bg-white group transition-all z-40"
          >
            <ChevronRight className="w-6 h-6 text-slate-400 group-hover:text-blue-500 group-hover:scale-125 transition-all" />
          </button>
        )}
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