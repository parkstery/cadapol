// RoutingPanel.tsx

import React, { useState } from 'react';
import { Waypoint, RouteOptions } from '../types';

interface RoutingPanelProps {
  onCalculateRoute: (waypoints: Waypoint[], options?: Partial<RouteOptions>) => void;
  onClose: () => void;
  currentRoute: { distance: number; duration: number } | null;
}

const RoutingPanel: React.FC<RoutingPanelProps> = ({
  onCalculateRoute,
  onClose,
  currentRoute,
}) => {
  const [waypoints, setWaypoints] = useState<Waypoint[]>([
    { id: 'origin', position: { lat: 0, lng: 0 }, label: '출발지', order: 0 },
    { id: 'destination', position: { lat: 0, lng: 0 }, label: '목적지', order: 1 },
  ]);
  const [travelMode, setTravelMode] = useState<'driving' | 'walking' | 'transit' | 'bicycling'>('driving');
  const [avoidTolls, setAvoidTolls] = useState(false);
  const [avoidHighways, setAvoidHighways] = useState(false);

  const handleAddWaypoint = () => {
    if (waypoints.length >= 6) {
      alert('최대 4개의 경유지를 추가할 수 있습니다.');
      return;
    }

    const newOrder = waypoints.length - 1; // 마지막 전에 추가
    const newWaypoint: Waypoint = {
      id: `waypoint-${Date.now()}`,
      position: { lat: 0, lng: 0 },
      label: `경유지 ${newOrder}`,
      order: newOrder,
    };

    // 목적지의 order를 증가시키고 새 경유지 삽입
    const updatedWaypoints = [...waypoints];
    updatedWaypoints[updatedWaypoints.length - 1].order = updatedWaypoints.length;
    updatedWaypoints.splice(updatedWaypoints.length - 1, 0, newWaypoint);

    setWaypoints(updatedWaypoints);
  };

  const handleRemoveWaypoint = (id: string) => {
    if (waypoints.length <= 2) {
      alert('최소 출발지와 목적지는 필요합니다.');
      return;
    }

    const updatedWaypoints = waypoints
      .filter((wp) => wp.id !== id)
      .map((wp, index) => ({ ...wp, order: index }));

    setWaypoints(updatedWaypoints);
  };

  const handleWaypointChange = (id: string, field: 'lat' | 'lng' | 'label', value: string | number) => {
    const updatedWaypoints = waypoints.map((wp) => {
      if (wp.id === id) {
        if (field === 'label') {
          return { ...wp, label: value as string };
        } else {
          return {
            ...wp,
            position: { ...wp.position, [field]: value as number },
          };
        }
      }
      return wp;
    });

    setWaypoints(updatedWaypoints);
  };

  const handleCalculate = () => {
    // 좌표가 모두 입력되었는지 확인
    const allValid = waypoints.every(
      (wp) => wp.position.lat !== 0 && wp.position.lng !== 0
    );

    if (!allValid) {
      alert('모든 경유지의 좌표를 입력해주세요.');
      return;
    }

    const options: Partial<RouteOptions> = {
      travelMode,
      avoidTolls,
      avoidHighways,
    };

    onCalculateRoute(waypoints, options);
  };

  const formatDistance = (meters: number): string => {
    if (meters < 1000) {
      return `${meters}m`;
    }
    return `${(meters / 1000).toFixed(2)}km`;
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}시간 ${minutes}분`;
    }
    return `${minutes}분`;
  };

  return (
    <div className="absolute top-4 left-4 z-[10000] bg-white rounded-lg shadow-lg p-4 w-80 max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">길찾기</h3>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 transition-colors"
          title="닫기"
        >
          ✕
        </button>
      </div>

      {/* 경로 정보 */}
      {currentRoute && (
        <div className="mb-4 p-3 bg-blue-50 rounded-lg">
          <div className="text-sm text-gray-600 mb-2">경로 정보</div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-700">
              거리: <strong>{formatDistance(currentRoute.distance)}</strong>
            </span>
            <span className="text-gray-700">
              시간: <strong>{formatDuration(currentRoute.duration)}</strong>
            </span>
          </div>
        </div>
      )}

      {/* 이동 수단 선택 */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          이동 수단
        </label>
        <select
          value={travelMode}
          onChange={(e) => setTravelMode(e.target.value as any)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="driving">자동차</option>
          <option value="walking">도보</option>
          <option value="transit">대중교통</option>
          <option value="bicycling">자전거</option>
        </select>
      </div>

      {/* 옵션 */}
      <div className="mb-4 space-y-2">
        <label className="flex items-center text-sm text-gray-700">
          <input
            type="checkbox"
            checked={avoidTolls}
            onChange={(e) => setAvoidTolls(e.target.checked)}
            className="mr-2"
          />
          톨게이트 회피
        </label>
        <label className="flex items-center text-sm text-gray-700">
          <input
            type="checkbox"
            checked={avoidHighways}
            onChange={(e) => setAvoidHighways(e.target.checked)}
            className="mr-2"
          />
          고속도로 회피
        </label>
      </div>

      {/* 경유지 목록 */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-700">경유지</label>
          {waypoints.length < 6 && (
            <button
              onClick={handleAddWaypoint}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              + 경유지 추가
            </button>
          )}
        </div>

        <div className="space-y-2">
          {waypoints.map((waypoint, index) => (
            <div key={waypoint.id} className="border border-gray-200 rounded-md p-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-600">
                  {index === 0
                    ? '출발지'
                    : index === waypoints.length - 1
                    ? '목적지'
                    : `경유지 ${index}`}
                </span>
                {index > 0 && index < waypoints.length - 1 && (
                  <button
                    onClick={() => handleRemoveWaypoint(waypoint.id)}
                    className="text-xs text-red-600 hover:text-red-800"
                  >
                    삭제
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  placeholder="위도"
                  value={waypoint.position.lat || ''}
                  onChange={(e) =>
                    handleWaypointChange(waypoint.id, 'lat', parseFloat(e.target.value) || 0)
                  }
                  className="text-xs px-2 py-1 border border-gray-300 rounded"
                  step="any"
                />
                <input
                  type="number"
                  placeholder="경도"
                  value={waypoint.position.lng || ''}
                  onChange={(e) =>
                    handleWaypointChange(waypoint.id, 'lng', parseFloat(e.target.value) || 0)
                  }
                  className="text-xs px-2 py-1 border border-gray-300 rounded"
                  step="any"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 버튼 */}
      <div className="flex gap-2">
        <button
          onClick={handleCalculate}
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          경로 찾기
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
        >
          닫기
        </button>
      </div>
    </div>
  );
};

export default RoutingPanel;
