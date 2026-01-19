// RoutingPanel.tsx

import React, { useState } from 'react';

interface RoutingPanelProps {
  onCalculate: (origin: string, destination: string, waypoints: string[]) => void;
  onClose: () => void;
}

export const RoutingPanel: React.FC<RoutingPanelProps> = ({ onCalculate, onClose }) => {
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [waypoints, setWaypoints] = useState<string[]>(['', '', '', '']);
  
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
  
  return (
    <div className="absolute top-20 left-4 z-[1000] bg-white rounded-lg shadow-lg p-4 w-80 max-h-[80vh] overflow-y-auto">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">길찾기</h3>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700"
        >
          ✕
        </button>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            출발지
          </label>
          <input
            type="text"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            placeholder="출발지 입력"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>
        
        {waypoints.map((waypoint, index) => (
          <div key={index}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              경유지 {index + 1} (선택)
            </label>
            <input
              type="text"
              value={waypoint}
              onChange={(e) => updateWaypoint(index, e.target.value)}
              placeholder={`경유지 ${index + 1} 입력`}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        ))}
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            목적지
          </label>
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="목적지 입력"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>
        
        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          경로 찾기
        </button>
      </form>
    </div>
  );
};
