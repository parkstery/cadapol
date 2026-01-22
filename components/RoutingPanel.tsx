// RoutingPanel.tsx - 카카오맵 스타일 길찾기 UI

import React, { useState } from 'react';

interface RoutingPanelProps {
  onCalculate: (origin: string, destination: string, waypoints: string[]) => void;
  onClose: () => void;
}

export const RoutingPanel: React.FC<RoutingPanelProps> = ({ onCalculate, onClose }) => {
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [waypoints, setWaypoints] = useState<string[]>(['']); // 기본값 1개
  
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
    }
  };
  
  const swapOriginDestination = () => {
    const temp = origin;
    setOrigin(destination);
    setDestination(temp);
  };

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
        <div className="flex items-center gap-2">
          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-white"></div>
          </div>
          <input
            type="text"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            placeholder="출발지 입력"
            className="flex-1 px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            required
          />
        </div>
        
        {/* 경유지들 */}
        {waypoints.map((waypoint, index) => (
          <div key={index} className="flex items-center gap-2">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-400 flex items-center justify-center">
              <span className="text-white text-xs font-medium">{index + 1}</span>
            </div>
            <input
              type="text"
              value={waypoint}
              onChange={(e) => updateWaypoint(index, e.target.value)}
              placeholder={`경유지 ${index + 1} 입력`}
              className="flex-1 px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
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
        ))}
        
        {/* 목적지 */}
        <div className="flex items-center gap-2">
          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-white"></div>
          </div>
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="목적지 입력"
            className="flex-1 px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            required
          />
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
