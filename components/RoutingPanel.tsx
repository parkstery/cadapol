// RoutingPanel.tsx - 카카오맵 스타일 길찾기 UI with 주소 검색

import React, { useState, useEffect, useRef } from 'react';
import { SearchResult } from '../types';

interface RoutingPanelProps {
  onCalculate: (origin: string, destination: string, waypoints: string[]) => void;
  onClose: () => void;
}

interface FieldSuggestions {
  suggestions: SearchResult[];
  showSuggestions: boolean;
}

export const RoutingPanel: React.FC<RoutingPanelProps> = ({ onCalculate, onClose }) => {
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [waypoints, setWaypoints] = useState<string[]>(['']); // 기본값 1개
  
  // 각 필드별 검색 제안 상태
  const [originSuggestions, setOriginSuggestions] = useState<FieldSuggestions>({ suggestions: [], showSuggestions: false });
  const [destinationSuggestions, setDestinationSuggestions] = useState<FieldSuggestions>({ suggestions: [], showSuggestions: false });
  const [waypointSuggestions, setWaypointSuggestions] = useState<Map<number, FieldSuggestions>>(new Map());
  
  const psRef = useRef<any>(null);
  const originInputRef = useRef<HTMLInputElement>(null);
  const destinationInputRef = useRef<HTMLInputElement>(null);
  const waypointInputRefs = useRef<Map<number, HTMLInputElement>>(new Map());
  
  // Kakao Places API 초기화
  useEffect(() => {
    const initPlaces = () => {
      if (window.kakao && window.kakao.maps && window.kakao.maps.services) {
        psRef.current = new window.kakao.maps.services.Places();
      }
    };

    if (window.kakao && window.kakao.maps) {
      window.kakao.maps.load(() => {
        initPlaces();
      });
    }
  }, []);
  
  // 주소 검색 함수
  const searchAddress = (query: string, callback: (suggestions: SearchResult[]) => void) => {
    if (!query.trim()) {
      callback([]);
      return;
    }
    
    if (psRef.current) {
      psRef.current.keywordSearch(query, (data: any, status: any) => {
        if (status === window.kakao.maps.services.Status.OK) {
          callback(data.slice(0, 5)); // 최대 5개 제안
        } else {
          callback([]);
        }
      });
    } else {
      callback([]);
    }
  };
  
  // 출발지 입력 핸들러
  const handleOriginInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setOrigin(val);
    
    if (val.trim()) {
      searchAddress(val, (suggestions) => {
        setOriginSuggestions({ suggestions, showSuggestions: true });
      });
    } else {
      setOriginSuggestions({ suggestions: [], showSuggestions: false });
    }
  };
  
  // 목적지 입력 핸들러
  const handleDestinationInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setDestination(val);
    
    if (val.trim()) {
      searchAddress(val, (suggestions) => {
        setDestinationSuggestions({ suggestions, showSuggestions: true });
      });
    } else {
      setDestinationSuggestions({ suggestions: [], showSuggestions: false });
    }
  };
  
  // 경유지 입력 핸들러
  const handleWaypointInput = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const newWaypoints = [...waypoints];
    newWaypoints[index] = val;
    setWaypoints(newWaypoints);
    
    if (val.trim()) {
      searchAddress(val, (suggestions) => {
        const newMap = new Map(waypointSuggestions);
        newMap.set(index, { suggestions, showSuggestions: true });
        setWaypointSuggestions(newMap);
      });
    } else {
      const newMap = new Map(waypointSuggestions);
      newMap.set(index, { suggestions: [], showSuggestions: false });
      setWaypointSuggestions(newMap);
    }
  };
  
  // 제안 선택 핸들러
  const selectOrigin = (item: SearchResult) => {
    setOrigin(item.place_name);
    setOriginSuggestions({ suggestions: [], showSuggestions: false });
  };
  
  const selectDestination = (item: SearchResult) => {
    setDestination(item.place_name);
    setDestinationSuggestions({ suggestions: [], showSuggestions: false });
  };
  
  const selectWaypoint = (index: number, item: SearchResult) => {
    const newWaypoints = [...waypoints];
    newWaypoints[index] = item.place_name;
    setWaypoints(newWaypoints);
    
    const newMap = new Map(waypointSuggestions);
    newMap.set(index, { suggestions: [], showSuggestions: false });
    setWaypointSuggestions(newMap);
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validWaypoints = waypoints.filter(wp => wp.trim() !== '');
    onCalculate(origin, destination, validWaypoints);
  };
  
  const updateWaypoint = (index: number, value: string) => {
    const newWaypoints = [...waypoints];
    newWaypoints[index] = value;
    setWaypoints(newWaypoints);
  };
  
  const addWaypoint = () => {
    setWaypoints([...waypoints, '']);
  };
  
  const removeWaypoint = (index: number) => {
    if (waypoints.length > 1) {
      const newWaypoints = waypoints.filter((_, i) => i !== index);
      setWaypoints(newWaypoints);
      
      // 해당 경유지의 제안도 제거
      const newMap = new Map(waypointSuggestions);
      newMap.delete(index);
      setWaypointSuggestions(newMap);
    }
  };
  
  const swapOriginDestination = () => {
    const temp = origin;
    setOrigin(destination);
    setDestination(temp);
    
    // 제안도 교체
    const tempSuggestions = originSuggestions;
    setOriginSuggestions(destinationSuggestions);
    setDestinationSuggestions(tempSuggestions);
  };
  
  // 외부 클릭 시 제안 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      
      if (originInputRef.current && !originInputRef.current.contains(target)) {
        setOriginSuggestions(prev => ({ ...prev, showSuggestions: false }));
      }
      
      if (destinationInputRef.current && !destinationInputRef.current.contains(target)) {
        setDestinationSuggestions(prev => ({ ...prev, showSuggestions: false }));
      }
      
      waypointInputRefs.current.forEach((ref, index) => {
        if (ref && !ref.contains(target)) {
          const newMap = new Map(waypointSuggestions);
          const current = newMap.get(index) || { suggestions: [], showSuggestions: false };
          newMap.set(index, { ...current, showSuggestions: false });
          setWaypointSuggestions(newMap);
        }
      });
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [waypointSuggestions]);

  return (
    <div className="absolute top-20 left-4 z-[1000] bg-white rounded-lg shadow-xl w-[360px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-6rem)] overflow-y-auto md:w-80">
      {/* 헤더 */}
      <div className="flex justify-between items-center p-4 border-b border-gray-200 sticky top-0 bg-white z-10">
        <h3 className="text-lg font-semibold text-gray-800">길찾기</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors p-1"
          aria-label="닫기"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      <form onSubmit={handleSubmit} className="p-4 space-y-2">
        {/* 출발지 */}
        <div className="relative">
          <div className="flex items-center gap-2">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-white"></div>
            </div>
            <div className="flex-1 relative" ref={originInputRef as any}>
              <input
                type="text"
                value={origin}
                onChange={handleOriginInput}
                onFocus={() => {
                  if (origin.trim() && originSuggestions.suggestions.length > 0) {
                    setOriginSuggestions(prev => ({ ...prev, showSuggestions: true }));
                  }
                }}
                placeholder="출발지 입력"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                required
              />
              {/* 출발지 제안 */}
              {originSuggestions.showSuggestions && originSuggestions.suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 bg-white border border-gray-300 shadow-lg max-h-48 overflow-y-auto z-20 mt-1 rounded-md">
                  {originSuggestions.suggestions.map((item, idx) => (
                    <div
                      key={idx}
                      className="px-3 py-2 cursor-pointer border-b border-gray-100 hover:bg-blue-50"
                      onClick={() => selectOrigin(item)}
                    >
                      <div className="font-medium text-sm truncate">{item.place_name}</div>
                      <div className="text-xs text-gray-500 truncate">{item.road_address_name || item.address_name}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* 경유지들 */}
        {waypoints.map((waypoint, index) => (
          <div key={index} className="relative">
            <div className="flex items-center gap-2">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-400 flex items-center justify-center">
                <span className="text-white text-xs font-medium">{index + 1}</span>
              </div>
              <div className="flex-1 relative" ref={(el) => {
                if (el) waypointInputRefs.current.set(index, el);
              }}>
                <input
                  type="text"
                  value={waypoint}
                  onChange={(e) => handleWaypointInput(index, e)}
                  onFocus={() => {
                    const current = waypointSuggestions.get(index);
                    if (waypoint.trim() && current && current.suggestions.length > 0) {
                      const newMap = new Map(waypointSuggestions);
                      newMap.set(index, { ...current, showSuggestions: true });
                      setWaypointSuggestions(newMap);
                    }
                  }}
                  placeholder={`경유지 ${index + 1} 입력`}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
                {/* 경유지 제안 */}
                {waypointSuggestions.get(index)?.showSuggestions && waypointSuggestions.get(index)?.suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-white border border-gray-300 shadow-lg max-h-48 overflow-y-auto z-20 mt-1 rounded-md">
                    {waypointSuggestions.get(index)?.suggestions.map((item, idx) => (
                      <div
                        key={idx}
                        className="px-3 py-2 cursor-pointer border-b border-gray-100 hover:bg-blue-50"
                        onClick={() => selectWaypoint(index, item)}
                      >
                        <div className="font-medium text-sm truncate">{item.place_name}</div>
                        <div className="text-xs text-gray-500 truncate">{item.road_address_name || item.address_name}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {waypoints.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeWaypoint(index)}
                  className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors"
                  aria-label="경유지 제거"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        ))}
        
        {/* 목적지 */}
        <div className="relative">
          <div className="flex items-center gap-2">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-white"></div>
            </div>
            <div className="flex-1 relative" ref={destinationInputRef as any}>
              <input
                type="text"
                value={destination}
                onChange={handleDestinationInput}
                onFocus={() => {
                  if (destination.trim() && destinationSuggestions.suggestions.length > 0) {
                    setDestinationSuggestions(prev => ({ ...prev, showSuggestions: true }));
                  }
                }}
                placeholder="목적지 입력"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                required
              />
              {/* 목적지 제안 */}
              {destinationSuggestions.showSuggestions && destinationSuggestions.suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 bg-white border border-gray-300 shadow-lg max-h-48 overflow-y-auto z-20 mt-1 rounded-md">
                  {destinationSuggestions.suggestions.map((item, idx) => (
                    <div
                      key={idx}
                      className="px-3 py-2 cursor-pointer border-b border-gray-100 hover:bg-blue-50"
                      onClick={() => selectDestination(item)}
                    >
                      <div className="font-medium text-sm truncate">{item.place_name}</div>
                      <div className="text-xs text-gray-500 truncate">{item.road_address_name || item.address_name}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={addWaypoint}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors"
              aria-label="경유지 추가"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        </div>
        
        {/* 출발지/목적지 교체 버튼 */}
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={swapOriginDestination}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
            aria-label="출발지와 목적지 교체"
            disabled={!origin || !destination}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
          </button>
        </div>
        
        {/* 경로 찾기 버튼 */}
        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 font-medium text-sm transition-colors mt-4"
        >
          경로 찾기
        </button>
      </form>
    </div>
  );
};
