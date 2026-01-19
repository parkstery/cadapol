
import React from 'react';
import { GISMode } from '../types';

interface KakaoGisToolbarProps {
  activeMode: GISMode;
  onAction: (mode: GISMode) => void;
  onToggleCadastral: () => void;
  onClear: () => void;
  isStreetViewActive?: boolean;
}

const KakaoGisToolbar: React.FC<KakaoGisToolbarProps> = ({ activeMode, onAction, onToggleCadastral, onClear, isStreetViewActive = false }) => {
  // 전체화면 버튼 위치에 따라 툴바 위치 조정
  // 전체화면 버튼: right-4 (16px) 또는 right-[50px] (거리뷰 활성화 시)
  // 버튼 너비: 약 32px (p-1.5 + 아이콘)
  // 툴바 너비: 5개 버튼 × 36px = 180px
  // 간격: 2px
  const toolbarRight = isStreetViewActive ? 'right-[228px]' : 'right-[198px]'; // 전체화면 버튼 왼쪽에 2px 간격
  
  return (
    <div className={`absolute top-4 ${toolbarRight} z-20 flex bg-white rounded-md shadow-lg border border-gray-300 overflow-hidden`}>
      <button 
        onClick={onClear}
        title="초기화"
        className="w-9 h-8 flex items-center justify-center border-r border-gray-100 text-red-500 hover:bg-red-50 transition-colors"
      >
        🗑️
      </button>
      <button 
        onClick={onToggleCadastral}
        title="지적도"
        className="w-9 h-8 flex items-center justify-center border-r border-gray-100 hover:bg-gray-50 transition-colors"
      >
        🗺️
      </button>
      <button 
        onClick={() => onAction(GISMode.DISTANCE)}
        title="거리 재기"
        className={`w-9 h-8 flex items-center justify-center border-r border-gray-100 transition-colors ${activeMode === GISMode.DISTANCE ? 'bg-blue-100' : 'hover:bg-gray-50'}`}
      >
        📏
      </button>
      <button 
        onClick={() => onAction(GISMode.AREA)}
        title="면적 재기"
        className={`w-9 h-8 flex items-center justify-center border-r border-gray-100 transition-colors ${activeMode === GISMode.AREA ? 'bg-blue-100' : 'hover:bg-gray-50'}`}
      >
        📐
      </button>
      <button 
        onClick={() => onAction(GISMode.ROADVIEW)}
        title="로드뷰"
        className={`w-9 h-8 flex items-center justify-center transition-colors ${activeMode === GISMode.ROADVIEW ? 'bg-blue-100' : 'hover:bg-gray-50'}`}
      >
        <img src="/streetview-icon.png" alt="로드뷰" className="w-5 h-5 object-contain" />
      </button>
    </div>
  );
};

export default KakaoGisToolbar;
