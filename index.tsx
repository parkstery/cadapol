import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Layers, Info, Layers as LayerIcon, Map as MapIcon, X, ChevronRight, Activity, MapPin, Copy, Search, Loader2 } from 'lucide-react';

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
  const overlayRef = useRef<any>(null); // InfoWindow 대신 CustomOverlay 사용
  const timerRef = useRef<any>(null); // 자동 제거 타이머
  const polygonRef = useRef<any>(null); // 지적도 폴리곤

  useEffect(() => {
    let retryCount = 0;
    const maxRetries = 50;

    const initMap = () => {
      const kakao = (window as any).kakao;
      // kakao.maps.services 라이브러리까지 로드되었는지 확인
      if (kakao && kakao.maps && kakao.maps.services) {
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
            console.log("Kakao Map Initialized");
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

  // 기존 그래픽 및 타이머 정리 함수
  const clearGraphics = () => {
    // 1. 기존 마커 제거
    if (markerRef.current) {
      markerRef.current.setMap(null);
      markerRef.current = null;
    }
    // 2. 기존 오버레이 제거
    if (overlayRef.current) {
      overlayRef.current.setMap(null);
      overlayRef.current = null;
    }
    // 3. 기존 타이머 제거
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // 4. 기존 폴리곤 제거
    if (polygonRef.current) {
      polygonRef.current.setMap(null);
      polygonRef.current = null;
    }
  };

  const handleMapClick = (latlng: any, currentMap: any) => {
    const kakao = (window as any).kakao;
    if (!currentMap || !kakao) return;

    // 기존 요소 초기화
    clearGraphics();

    // ----------------------------------------------------
    // [1단계] 마커 및 주소 표시 (CustomOverlay)
    // ----------------------------------------------------
    
    // 1. 마커 생성
    const marker = new kakao.maps.Marker({ 
      position: latlng,
      map: currentMap,
      zIndex: 1 
    });
    markerRef.current = marker;

    // 2. 좌표 -> 주소 변환
    const geocoder = new kakao.maps.services.Geocoder();
    geocoder.coord2Address(latlng.getLng(), latlng.getLat(), (result: any, status: any) => {
      let address = '주소정보 없음';
      
      if (status === kakao.maps.services.Status.OK && result[0]) {
        const addrObj = result[0];
        if (addrObj.road_address) {
          address = addrObj.road_address.address_name;
        } else if (addrObj.address) {
          address = addrObj.address.address_name;
        }
      }

      // 3. CustomOverlay 컨텐츠
      const contentHTML = `
        <div style="
          background: white;
          border: 1px solid #444;
          padding: 8px 10px;
          border-radius: 6px;
          font-size: 12px;
          white-space: nowrap;
          box-shadow: 1px 2px 4px rgba(0,0,0,0.3);
          font-family: 'Pretendard', sans-serif;
          color: #333;
        ">
          <div style="font-weight:bold; margin-bottom:2px;">📍 ${address}</div>
          <span style="color:#666; font-size:11px;">
            (${latlng.getLat().toFixed(6)}, ${latlng.getLng().toFixed(6)})
          </span>
        </div>
      `;

      // 4. CustomOverlay 표시
      const overlay = new kakao.maps.CustomOverlay({
        map: currentMap,
        position: latlng,
        content: contentHTML,
        yAnchor: 2.3
      });
      overlayRef.current = overlay;

      // 5. 5초 후 자동 제거
      timerRef.current = setTimeout(() => {
        clearGraphics();
      }, 5000);
    });

    // ----------------------------------------------------
    // [2단계] 지적 정보 데이터 호출 (VWorld Proxy)
    // ----------------------------------------------------
    fetchCadastralData(latlng.getLng(), latlng.getLat());
  };

  /**
   * 프록시 서버(/api/vworld)를 통한 지적도 데이터 요청
   */
  const fetchCadastralData = async (lng: number, lat: number) => {
    setLoading(true);
    setSidebarOpen(true);
    setSelectedInfo(null); // 이전 정보 초기화

    try {
      // 캐시 방지를 위해 timestamp 추가
      const url = `/api/vworld?lng=${lng}&lat=${lat}&t=${Date.now()}`;
      console.log('Fetching cadastral data via Proxy:', url);
      
      const response = await fetch(url);
      
      // HTML 응답(404 페이지 등)이 오는지 확인
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("서버에서 올바른 JSON 응답을 받지 못했습니다. (API 경로 확인 필요)");
      }

      const data = await response.json();
      processVWorldData(data);
    } catch (error) {
      console.error("Failed to fetch cadastral data:", error);
      setSelectedInfo({ error: "데이터를 가져오는데 실패했습니다. (API Proxy Error)" });
    } finally {
      setLoading(false);
    }
  };

  const processVWorldData = (data: any) => {
    if (data.response && data.response.status === 'OK' && data.response.result.featureCollection.features.length > 0) {
      const feature = data.response.result.featureCollection.features[0];
      
      setSelectedInfo({
        pnu: feature.properties.pnu,
        addr: feature.properties.addr,
        jibun: feature.properties.jibun,
        area: feature.properties.area, // null일 수 있음
        bonbun: feature.properties.bonbun,
        bubun: feature.properties.bubun,
      });

      // 폴리곤 그리기
      if (feature.geometry) {
        drawParcelPolygon(feature.geometry);
      }
    } else {
      setSelectedInfo({ error: '해당 위치의 지적 정보를 찾을 수 없습니다.' });
    }
  };

  const drawParcelPolygon = (geometry: any) => {
    const kakao = (window as any).kakao;
    if (!map || !kakao || !geometry) return;

    let path: any[] = [];
    
    try {
      if (geometry.type === 'Polygon') {
        path = geometry.coordinates[0].map((coord: number[]) => new kakao.maps.LatLng(coord[1], coord[0]));
      } else if (geometry.type === 'MultiPolygon') {
        path = geometry.coordinates[0][0].map((coord: number[]) => new kakao.maps.LatLng(coord[1], coord[0]));
      }
    } catch (e) {
      console.error("Geometry parsing error", e);
      return;
    }

    if (path.length > 0) {
      const polygon = new kakao.maps.Polygon({
        path: path,
        strokeWeight: 3,
        strokeColor: '#ef4444', // 붉은색 강조
        strokeOpacity: 0.9,
        strokeStyle: 'solid',
        fillColor: '#ef4444',
        fillOpacity: 0.2
      });
      polygon.setMap(map);
      polygonRef.current = polygon;
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
    try {
      if (showCadastral) map.addOverlayMapTypeId(kakao.maps.MapTypeId.DISTRICT);
      else map.removeOverlayMapTypeId(kakao.maps.MapTypeId.DISTRICT);
    } catch (e) {}
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
             <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-3">
               <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
               <p className="text-sm">지적 정보를 불러오는 중...</p>
             </div>
           ) : selectedInfo ? (
             selectedInfo.error ? (
                <div className="text-center mt-12 p-8 border-2 border-dashed border-red-500/20 rounded-3xl flex flex-col items-center gap-4">
                  <Activity className="w-8 h-8 text-red-500" />
                  <p className="text-sm text-red-400">{selectedInfo.error}</p>
                </div>
             ) : (
                <div className="space-y-4 animate-fadeIn">
                  <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                    <label className="text-xs font-bold text-blue-400 mb-1 block">주소</label>
                    <div className="text-white font-medium text-sm leading-relaxed">{selectedInfo.addr}</div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                      <label className="text-xs font-bold text-slate-400 mb-1 block">지번</label>
                      <div className="text-white font-medium">{selectedInfo.jibun}</div>
                    </div>
                    <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                      <label className="text-xs font-bold text-slate-400 mb-1 block">공시지가/면적</label>
                      <div className="text-white font-medium truncate">{selectedInfo.area ? `${selectedInfo.area}㎡` : '-'}</div>
                    </div>
                  </div>

                  <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                    <label className="text-xs font-bold text-slate-400 mb-1 block">PNU 코드</label>
                    <div className="text-slate-300 font-mono text-xs tracking-wider">{selectedInfo.pnu}</div>
                  </div>
                </div>
             )
           ) : (
            <div className="text-center mt-12 p-8 border-2 border-dashed border-white/10 rounded-3xl flex flex-col items-center gap-4">
              <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center">
                <Search className="w-6 h-6 text-slate-500" />
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">
                지도상의 위치를 클릭하여<br/>주소와 상세 정보를 확인하세요.
              </p>
            </div>
           )}
        </div>
        <div className="p-5 text-[10px] text-slate-500 text-center border-t border-white/10 bg-black/10 tracking-tight">
          &copy; Kakao Maps & VWorld
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
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.4s ease-out forwards;
        }
      `}</style>
    </div>
  );
};

const root = createRoot(document.getElementById('app')!);
root.render(<App />);