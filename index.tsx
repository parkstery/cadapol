import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Layers, Search, Info, Layers as LayerIcon, Map as MapIcon, X, ChevronRight, Activity } from 'lucide-react';

/**
 * 환경 설정 및 API 키 정의
 */
const VWORLD_KEY = '76717551-09A3-311D-894E-87A4F9535D7A'; 

const App = () => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<any>(null);
  const [baseLayer, setBaseLayer] = useState<'ROADMAP' | 'SKYVIEW'>('ROADMAP');
  const [showCadastral, setShowCadastral] = useState(false);
  const [selectedInfo, setSelectedInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
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

          kakao.maps.event.addListener(kakaoMap, 'click', (mouseEvent: any) => {
            const latlng = mouseEvent.latLng;
            fetchCadastralData(latlng.getLng(), latlng.getLat());
          });
        } catch (e) {
          console.error("Map initialization failed:", e);
        }
      });
    } else {
      console.error("Kakao Maps SDK not found. Check network or API key.");
    }
  }, []);

  const fetchCadastralData = async (lng: number, lat: number) => {
    setLoading(true);
    setSidebarOpen(true);
    try {
      const url = `https://api.vworld.kr/req/data?service=data&request=GetFeature&data=LP_PA_CB_ND_BU&key=${VWORLD_KEY}&geomFilter=POINT(${lng} ${lat})&geometry=true`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error("Network response was not ok");
      
      const data = await response.json();

      if (data.response && data.response.status === 'OK' && data.response.result.featureCollection.features.length > 0) {
        const feature = data.response.result.featureCollection.features[0];
        setSelectedInfo({
          pnu: feature.properties.pnu,
          addr: feature.properties.addr,
          jibun: feature.properties.jibun,
          area: feature.properties.area,
          bonbun: feature.properties.bonbun,
          bubun: feature.properties.bubun,
          raw: feature.properties
        });
      } else {
        setSelectedInfo({ error: '해당 위치의 지적 정보를 찾을 수 없습니다.' });
      }
    } catch (error) {
      console.error('API Error:', error);
      setSelectedInfo({ error: '데이터 요청 중 오류가 발생했습니다. VWorld API 키를 확인해주세요.' });
    } finally {
      setLoading(false);
    }
  };

  const toggleBaseMap = (type: 'ROADMAP' | 'SKYVIEW') => {
    if (!map) return;
    const kakao = (window as any).kakao;
    const mapType = type === 'ROADMAP' ? kakao.maps.MapTypeId.ROADMAP : kakao.maps.MapTypeId.HYBRID;
    map.setMapTypeId(mapType);
    setBaseLayer(type);
  };

  useEffect(() => {
    if (!map) return;
    const kakao = (window as any).kakao;
    try {
      if (showCadastral) {
        map.addOverlayMapTypeId(kakao.maps.MapTypeId.DISTRICT);
      } else {
        map.removeOverlayMapTypeId(kakao.maps.MapTypeId.DISTRICT);
      }
    } catch (e) {
      console.warn("Failed to toggle overlay:", e);
    }
  }, [showCadastral, map]);

  return (
    <div className="relative w-full h-full flex overflow-hidden bg-slate-900 text-slate-900">
      {/* Sidebar */}
      <div className={`fixed left-0 top-0 h-full w-80 dark-glass z-50 transition-transform duration-300 ease-in-out transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} shadow-2xl flex flex-col`}>
        <div className="p-4 border-b border-white/10 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Info className="w-5 h-5 text-blue-400" />
            <h2 className="font-bold text-lg text-white">지적 정보 추출</h2>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="p-1 hover:bg-white/10 rounded text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3">
              <Activity className="w-8 h-8 text-blue-500 animate-spin" />
              <p className="text-sm text-slate-400">데이터를 불러오는 중...</p>
            </div>
          ) : selectedInfo ? (
            selectedInfo.error ? (
              <div className="bg-red-500/10 border border-red-500/20 p-3 rounded text-sm text-red-400">
                {selectedInfo.error}
              </div>
            ) : (
              <div className="space-y-4 text-white">
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 uppercase tracking-wider">주소</label>
                  <p className="text-md font-medium">{selectedInfo.addr || '정보 없음'}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase tracking-wider">PNU</label>
                    <p className="text-xs font-mono text-blue-300 break-all">{selectedInfo.pnu}</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase tracking-wider">면적 (m²)</label>
                    <p className="text-sm">{selectedInfo.area || '0'}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase tracking-wider">본번-부번</label>
                    <p className="text-sm">{selectedInfo.bonbun}-{selectedInfo.bubun}</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 uppercase tracking-wider">지번</label>
                    <p className="text-sm">{selectedInfo.jibun}</p>
                  </div>
                </div>
              </div>
            )
          ) : (
            <div className="text-center text-slate-500 mt-10">
              <p>지도상의 필지를 클릭하여<br/>정보를 추출하세요.</p>
            </div>
          )}
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <div ref={mapContainer} className="w-full h-full" />

        {/* Map Controls */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-2 z-40">
          <div className="glass flex rounded-lg shadow-lg overflow-hidden p-1 border border-white/20">
            <button 
              onClick={() => toggleBaseMap('ROADMAP')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-all ${baseLayer === 'ROADMAP' ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
            >
              <MapIcon className="w-4 h-4" /> 일반
            </button>
            <button 
              onClick={() => toggleBaseMap('SKYVIEW')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-all ${baseLayer === 'SKYVIEW' ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
            >
              <Layers className="w-4 h-4" /> 위성
            </button>
          </div>

          <button 
            onClick={() => setShowCadastral(!showCadastral)}
            className={`glass px-4 py-1.5 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2 border border-white/20 transition-all ${showCadastral ? 'bg-orange-500 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
          >
            <LayerIcon className="w-4 h-4" /> 지적도
          </button>
        </div>

        {!sidebarOpen && (
          <button 
            onClick={() => setSidebarOpen(true)}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-8 h-16 glass rounded-r-xl flex items-center justify-center shadow-xl hover:bg-white transition-all z-40"
          >
            <ChevronRight className="w-5 h-5 text-slate-400" />
          </button>
        )}
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById('app')!);
root.render(<App />);