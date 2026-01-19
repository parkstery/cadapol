// utils/constants.ts

/**
 * 맵 관련 상수 정의
 */

// 좌표계 임계값
export const COORDINATE_THRESHOLD = {
  LOCATION: 0.0001,  // 약 11m
  TM_DETECTION: {
    X_MAX: 180,
    Y_MAX: 90,
  },
};

// SDK 체크 간격 (ms)
export const SDK_CHECK_INTERVAL = 300;

// 리사이즈 지연 시간 (ms)
export const RESIZE_DELAY = 100;

// 미니맵 크기
export const MINIMAP_SIZE = {
  width: 240,
  height: 240,
};

// 검색 기록 최대 개수
export const MAX_SEARCH_HISTORY = 5;

// 검색 제안 최대 개수
export const MAX_SEARCH_SUGGESTIONS = 10;

// 트랜지션 시간 (ms)
export const TRANSITION_DURATION = 300;

// 줌 레벨 범위
export const ZOOM_RANGE = {
  MIN: 3,
  MAX: 20,
  KAKAO_MIN: 1,
  KAKAO_MAX: 14,
};

// 레이어 기본 Z-index
export const LAYER_Z_INDEX = {
  BASE: 10,
  CADASTRAL: 20,
  ADMINISTRATIVE_BOUNDARY: 30,
  TOPOGRAPHIC: 40,
  CUSTOM: 50,
};

// 경로 표시 스타일
export const ROUTE_STYLE = {
  STROKE_WEIGHT: 5,
  STROKE_COLOR: '#3B82F6',
  STROKE_OPACITY: 0.8,
  HIGHLIGHT_STROKE_WEIGHT: 7,
  HIGHLIGHT_STROKE_COLOR: '#2563EB',
};

// 최대 경유지 수
export const MAX_WAYPOINTS = 5;  // 출발지 + 경유지 3개 + 목적지
