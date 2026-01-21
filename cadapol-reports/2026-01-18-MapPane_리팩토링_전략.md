# MapPane.tsx 리팩토링 전략

**현재 상태**: 3,106 lines의 단일 파일  
**목표**: 모듈화, 유지보수성 향상, 테스트 가능성 개선

---

## 1. 현재 구조 분석

### 1.1 주요 책임 (Responsibilities)

MapPane.tsx는 현재 다음과 같은 책임을 모두 가지고 있습니다:

1. **맵 제공자 초기화** (Google, Kakao, Naver)
2. **맵 동기화 로직** (위치, 줌 레벨)
3. **거리뷰/로드뷰 구현** (3개 제공자별)
4. **GIS 도구** (거리 측정, 면적 측정, 지적도)
5. **미니맵 관리** (거리뷰 활성화 시)
6. **마커/오버레이 관리**
7. **이벤트 리스너 관리**
8. **상태 관리** (맵 상태, 거리뷰 상태, GIS 모드)

### 1.2 문제점

- ❌ **단일 책임 원칙 위반**: 하나의 컴포넌트가 너무 많은 책임
- ❌ **높은 결합도**: 맵 제공자별 로직이 강하게 결합
- ❌ **테스트 어려움**: 모든 로직이 한 곳에 있어 단위 테스트 불가
- ❌ **재사용 불가**: 맵 제공자 로직을 다른 곳에서 재사용 불가
- ❌ **가독성 저하**: 3,000+ lines는 이해하기 어려움

---

## 2. 리팩토링 전략

### 전략 1: 제공자별 분리 (Provider-based Separation) ⭐ **추천**

**핵심 아이디어**: 각 맵 제공자(Google, Kakao, Naver)를 별도 모듈로 분리

#### 2.1.1 목표 구조

```
components/
├── MapPane.tsx                    # 메인 컴포넌트 (200-300 lines)
├── map-providers/
│   ├── BaseMapProvider.ts         # 공통 인터페이스
│   ├── GoogleMapProvider.tsx      # Google Maps 구현
│   ├── KakaoMapProvider.tsx       # Kakao Maps 구현
│   └── NaverMapProvider.tsx       # Naver Maps 구현
├── streetview/
│   ├── GoogleStreetView.tsx
│   ├── KakaoRoadView.tsx
│   └── NaverPanorama.tsx
├── gis-tools/
│   ├── DistanceMeasure.tsx
│   ├── AreaMeasure.tsx
│   └── CadastralOverlay.tsx
└── hooks/
    ├── useMapSync.ts              # 맵 동기화 훅
    ├── useStreetView.ts           # 거리뷰 훅
    └── useMapProvider.ts          # 맵 제공자 선택 훅
```

#### 2.1.2 구현 예시

**BaseMapProvider.ts** (인터페이스 정의)
```typescript
export interface MapProvider {
  // 맵 초기화
  initMap(container: HTMLElement, config: PaneConfig, initialState: MapState): void;
  
  // 상태 동기화
  syncState(state: MapState): void;
  
  // 위성 모드 전환
  setSatelliteMode(enabled: boolean): void;
  
  // 마커 관리
  setMarker(position: { lat: number; lng: number } | null): void;
  
  // 리소스 정리
  cleanup(): void;
  
  // 맵 인스턴스 접근
  getMapInstance(): any;
}

export interface StreetViewProvider {
  // 거리뷰 시작
  startStreetView(container: HTMLElement, position: { lat: number; lng: number }): void;
  
  // 거리뷰 종료
  stopStreetView(): void;
  
  // 위치 동기화
  syncPosition(position: { lat: number; lng: number }): void;
  
  // 리소스 정리
  cleanup(): void;
}
```

**GoogleMapProvider.tsx** (구현)
```typescript
import { BaseMapProvider, MapProvider } from './BaseMapProvider';
import { MapState, PaneConfig } from '../../types';

export class GoogleMapProvider implements MapProvider {
  private map: google.maps.Map | null = null;
  private panorama: google.maps.StreetViewPanorama | null = null;
  private marker: google.maps.Marker | null = null;
  private listeners: google.maps.MapsEventListener[] = [];
  
  initMap(container: HTMLElement, config: PaneConfig, initialState: MapState): void {
    this.panorama = new google.maps.StreetViewPanorama(/* ... */);
    
    this.map = new google.maps.Map(container, {
      center: { lat: initialState.lat, lng: initialState.lng },
      zoom: initialState.zoom,
      mapTypeId: config.isSatellite ? 'satellite' : 'roadmap',
      streetView: this.panorama,
      // ...
    });
    
    this.setupListeners();
  }
  
  syncState(state: MapState): void {
    if (this.map) {
      this.map.setCenter({ lat: state.lat, lng: state.lng });
      this.map.setZoom(state.zoom);
    }
  }
  
  setSatelliteMode(enabled: boolean): void {
    if (this.map) {
      this.map.setMapTypeId(enabled ? 'satellite' : 'roadmap');
    }
  }
  
  setMarker(position: { lat: number; lng: number } | null): void {
    if (!this.map) return;
    
    if (position) {
      if (!this.marker) {
        this.marker = new google.maps.Marker({ map: this.map });
      }
      this.marker.setPosition(position);
    } else {
      if (this.marker) {
        this.marker.setMap(null);
        this.marker = null;
      }
    }
  }
  
  private setupListeners(): void {
    if (!this.map) return;
    
    const centerListener = this.map.addListener('center_changed', () => {
      // 동기화 로직
    });
    this.listeners.push(centerListener);
    
    // ... 기타 리스너
  }
  
  getMapInstance(): google.maps.Map | null {
    return this.map;
  }
  
  cleanup(): void {
    this.listeners.forEach(listener => google.maps.event.removeListener(listener));
    this.listeners = [];
    if (this.marker) {
      this.marker.setMap(null);
      this.marker = null;
    }
    this.map = null;
    this.panorama = null;
  }
}
```

**MapPane.tsx** (리팩토링 후)
```typescript
import React, { useEffect, useRef, useState } from 'react';
import { MapVendor, MapState, PaneConfig } from '../types';
import { GoogleMapProvider } from './map-providers/GoogleMapProvider';
import { KakaoMapProvider } from './map-providers/KakaoMapProvider';
import { NaverMapProvider } from './map-providers/NaverMapProvider';
import { useMapSync } from './hooks/useMapSync';
import { useStreetView } from './hooks/useStreetView';

const MapPane: React.FC<MapPaneProps> = ({ 
  side, config, globalState, onStateChange, searchPos, 
  isFullscreen, onToggleFullscreen, streetViewState, onStreetViewChange
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const providerRef = useRef<MapProvider | null>(null);
  
  // 맵 제공자 선택
  useEffect(() => {
    if (!containerRef.current) return;
    
    // 기존 제공자 정리
    if (providerRef.current) {
      providerRef.current.cleanup();
    }
    
    // 새 제공자 생성
    switch (config.type) {
      case 'google':
        providerRef.current = new GoogleMapProvider();
        break;
      case 'kakao':
        providerRef.current = new KakaoMapProvider();
        break;
      case 'naver':
        providerRef.current = new NaverMapProvider();
        break;
    }
    
    // 맵 초기화
    providerRef.current.initMap(containerRef.current, config, globalState);
    
    return () => {
      if (providerRef.current) {
        providerRef.current.cleanup();
      }
    };
  }, [config.type]);
  
  // 상태 동기화
  useMapSync(providerRef.current, globalState, onStateChange);
  
  // 거리뷰 관리
  useStreetView(providerRef.current, streetViewState, onStreetViewChange);
  
  // 마커 설정
  useEffect(() => {
    if (providerRef.current && searchPos) {
      providerRef.current.setMarker(searchPos);
    }
  }, [searchPos]);
  
  return (
    <div className="w-full h-full relative">
      <div ref={containerRef} className="w-full h-full" />
      {/* UI 컨트롤들 */}
    </div>
  );
};
```

#### 2.1.3 장점

✅ **명확한 책임 분리**: 각 제공자가 자신의 책임만 가짐  
✅ **테스트 용이**: 각 제공자를 독립적으로 테스트 가능  
✅ **재사용성**: 제공자 로직을 다른 곳에서도 사용 가능  
✅ **확장성**: 새로운 맵 제공자 추가가 쉬움  
✅ **가독성**: MapPane.tsx가 200-300 lines로 축소

#### 2.1.4 단점

⚠️ 초기 작업량이 많음 (하지만 장기적으로 유리)  
⚠️ 인터페이스 설계가 중요함

---

### 전략 2: 기능별 분리 (Feature-based Separation)

**핵심 아이디어**: 기능(동기화, 거리뷰, GIS 도구 등)별로 분리

#### 2.2.1 목표 구조

```
components/
├── MapPane.tsx
├── features/
│   ├── MapSync.tsx              # 맵 동기화 기능
│   ├── StreetView.tsx            # 거리뷰 기능
│   ├── GisTools.tsx              # GIS 도구 기능
│   └── MiniMap.tsx               # 미니맵 기능
└── providers/
    ├── google/
    │   ├── GoogleMap.tsx
    │   └── GoogleStreetView.tsx
    ├── kakao/
    │   ├── KakaoMap.tsx
    │   └── KakaoRoadView.tsx
    └── naver/
        ├── NaverMap.tsx
        └── NaverPanorama.tsx
```

#### 2.2.2 장점

✅ 기능별로 명확히 분리  
✅ 기능 단위로 테스트 가능

#### 2.2.3 단점

⚠️ 맵 제공자별 로직이 여전히 분산됨  
⚠️ 기능 간 의존성 관리가 복잡할 수 있음

---

### 전략 3: 커스텀 훅 분리 (Hook-based Separation)

**핵심 아이디어**: 로직을 커스텀 훅으로 추출

#### 2.3.1 목표 구조

```
components/
├── MapPane.tsx
└── hooks/
    ├── useGoogleMap.ts
    ├── useKakaoMap.ts
    ├── useNaverMap.ts
    ├── useMapSync.ts
    ├── useStreetView.ts
    └── useGisTools.ts
```

#### 2.3.2 구현 예시

```typescript
// hooks/useGoogleMap.ts
export const useGoogleMap = (
  containerRef: RefObject<HTMLDivElement>,
  config: PaneConfig,
  globalState: MapState,
  onStateChange: (state: MapState) => void
) => {
  const mapRef = useRef<google.maps.Map | null>(null);
  const [sdkLoaded, setSdkLoaded] = useState(false);
  
  useEffect(() => {
    // Google Maps 초기화 로직
  }, [config, globalState]);
  
  return { map: mapRef.current, sdkLoaded };
};

// MapPane.tsx
const MapPane: React.FC<MapPaneProps> = (props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  const googleMap = useGoogleMap(containerRef, config, globalState, onStateChange);
  const kakaoMap = useKakaoMap(containerRef, config, globalState, onStateChange);
  const naverMap = useNaverMap(containerRef, config, globalState, onStateChange);
  
  const currentMap = config.type === 'google' ? googleMap 
                  : config.type === 'kakao' ? kakaoMap 
                  : naverMap;
  
  return <div ref={containerRef} />;
};
```

#### 2.3.3 장점

✅ React 패턴에 부합  
✅ 로직 재사용 가능  
✅ 테스트 용이

#### 2.3.4 단점

⚠️ 훅 간 의존성 관리 필요  
⚠️ 상태 공유가 복잡할 수 있음

---

## 3. 추천 리팩토링 계획

### 3.1 하이브리드 접근법 (추천) ⭐

**전략 1 (제공자별 분리) + 전략 3 (커스텀 훅)**을 결합

#### 단계별 계획

**Phase 1: 기반 구조 구축** (1-2일)
1. `BaseMapProvider` 인터페이스 정의
2. 디렉토리 구조 생성
3. 타입 정의 정리

**Phase 2: Google Maps 분리** (1일)
1. `GoogleMapProvider` 클래스 생성
2. Google Maps 관련 로직 이동
3. 테스트 및 검증

**Phase 3: Kakao Maps 분리** (2일)
1. `KakaoMapProvider` 클래스 생성
2. Kakao Maps 관련 로직 이동
3. GIS 도구 분리 (`gis-tools/` 디렉토리)
4. 테스트 및 검증

**Phase 4: Naver Maps 분리** (1일)
1. `NaverMapProvider` 클래스 생성
2. Naver Maps 관련 로직 이동
3. 테스트 및 검증

**Phase 5: 거리뷰 분리** (1-2일)
1. `StreetViewProvider` 인터페이스 정의
2. 각 제공자별 거리뷰 구현 분리
3. `useStreetView` 훅 생성

**Phase 6: 동기화 로직 분리** (1일)
1. `useMapSync` 훅 생성
2. 동기화 로직 이동

**Phase 7: MapPane.tsx 리팩토링** (1일)
1. 새 구조로 MapPane.tsx 재작성
2. 통합 테스트

**총 예상 시간**: 7-10일

---

## 4. 구체적 구현 가이드

### 4.1 BaseMapProvider 인터페이스 상세

```typescript
// map-providers/BaseMapProvider.ts

export interface MapProviderConfig {
  container: HTMLElement;
  initialState: MapState;
  isSatellite: boolean;
  onStateChange: (state: MapState) => void;
}

export interface MapProvider {
  // 초기화
  init(config: MapProviderConfig): Promise<void>;
  
  // 상태 관리
  syncState(state: MapState): void;
  getState(): MapState;
  
  // 설정
  setSatelliteMode(enabled: boolean): void;
  setZoom(zoom: number): void;
  setCenter(lat: number, lng: number): void;
  
  // 마커
  setMarker(position: { lat: number; lng: number } | null): void;
  
  // 이벤트
  on(event: string, handler: Function): void;
  off(event: string, handler: Function): void;
  
  // 리소스 관리
  cleanup(): void;
  
  // 인스턴스 접근 (필요시)
  getMapInstance(): any;
}
```

### 4.2 GoogleMapProvider 구현 예시

```typescript
// map-providers/GoogleMapProvider.tsx

export class GoogleMapProvider implements MapProvider {
  private map: google.maps.Map | null = null;
  private panorama: google.maps.StreetViewPanorama | null = null;
  private marker: google.maps.Marker | null = null;
  private listeners: google.maps.MapsEventListener[] = [];
  private config: MapProviderConfig | null = null;
  private isProgrammaticUpdate = false;
  
  async init(config: MapProviderConfig): Promise<void> {
    this.config = config;
    
    // Panorama 초기화
    const panoContainer = document.createElement('div');
    this.panorama = new google.maps.StreetViewPanorama(panoContainer, {
      visible: false,
      enableCloseButton: false,
    });
    
    // Map 초기화
    this.map = new google.maps.Map(config.container, {
      center: { lat: config.initialState.lat, lng: config.initialState.lng },
      zoom: config.initialState.zoom,
      mapTypeId: config.isSatellite ? 'satellite' : 'roadmap',
      streetView: this.panorama,
      // ...
    });
    
    this.setupListeners();
  }
  
  syncState(state: MapState): void {
    if (!this.map || this.isProgrammaticUpdate) return;
    
    this.isProgrammaticUpdate = true;
    this.map.setCenter({ lat: state.lat, lng: state.lng });
    this.map.setZoom(state.zoom);
    
    setTimeout(() => {
      this.isProgrammaticUpdate = false;
    }, 100);
  }
  
  getState(): MapState {
    if (!this.map) {
      throw new Error('Map not initialized');
    }
    
    const center = this.map.getCenter();
    return {
      lat: center.lat(),
      lng: center.lng(),
      zoom: this.map.getZoom() || 17,
    };
  }
  
  private setupListeners(): void {
    if (!this.map || !this.config) return;
    
    // center_changed
    const centerListener = this.map.addListener('center_changed', () => {
      if (this.isProgrammaticUpdate) return;
      const state = this.getState();
      this.config!.onStateChange(state);
    });
    this.listeners.push(centerListener);
    
    // zoom_changed
    const zoomListener = this.map.addListener('zoom_changed', () => {
      if (this.isProgrammaticUpdate) return;
      const state = this.getState();
      this.config!.onStateChange(state);
    });
    this.listeners.push(zoomListener);
  }
  
  cleanup(): void {
    this.listeners.forEach(listener => google.maps.event.removeListener(listener));
    this.listeners = [];
    
    if (this.marker) {
      this.marker.setMap(null);
      this.marker = null;
    }
    
    this.map = null;
    this.panorama = null;
    this.config = null;
  }
  
  // ... 기타 메서드
}
```

### 4.3 useMapProvider 훅

```typescript
// hooks/useMapProvider.ts

export const useMapProvider = (
  config: PaneConfig,
  globalState: MapState,
  onStateChange: (state: MapState) => void,
  containerRef: RefObject<HTMLDivElement>
) => {
  const providerRef = useRef<MapProvider | null>(null);
  const [sdkLoaded, setSdkLoaded] = useState(false);
  
  useEffect(() => {
    if (!containerRef.current) return;
    
    // 기존 제공자 정리
    if (providerRef.current) {
      providerRef.current.cleanup();
      providerRef.current = null;
    }
    
    // 새 제공자 생성 및 초기화
    const initProvider = async () => {
      let provider: MapProvider;
      
      switch (config.type) {
        case 'google':
          provider = new GoogleMapProvider();
          break;
        case 'kakao':
          provider = new KakaoMapProvider();
          break;
        case 'naver':
          provider = new NaverMapProvider();
          break;
        default:
          throw new Error(`Unknown map provider: ${config.type}`);
      }
      
      await provider.init({
        container: containerRef.current!,
        initialState: globalState,
        isSatellite: config.isSatellite,
        onStateChange,
      });
      
      providerRef.current = provider;
      setSdkLoaded(true);
    };
    
    initProvider();
    
    return () => {
      if (providerRef.current) {
        providerRef.current.cleanup();
        providerRef.current = null;
      }
    };
  }, [config.type, config.isSatellite]);
  
  // 상태 동기화
  useEffect(() => {
    if (providerRef.current && sdkLoaded) {
      providerRef.current.syncState(globalState);
    }
  }, [globalState, sdkLoaded]);
  
  return { provider: providerRef.current, sdkLoaded };
};
```

---

## 5. 마이그레이션 전략

### 5.1 점진적 마이그레이션

**원칙**: 기존 코드를 한 번에 교체하지 않고 점진적으로 이동

1. **새 구조 생성**: 새 디렉토리와 파일 생성
2. **하나씩 이동**: 한 제공자씩 이동하고 테스트
3. **기존 코드 유지**: 이동 완료 전까지 기존 코드 유지
4. **최종 통합**: 모든 이동 완료 후 MapPane.tsx 리팩토링

### 5.2 테스트 전략

각 단계마다 다음을 테스트:

1. **기능 테스트**: 맵이 정상적으로 로드되는지
2. **동기화 테스트**: 두 패널이 정확히 동기화되는지
3. **거리뷰 테스트**: 거리뷰가 정상 작동하는지
4. **성능 테스트**: 리팩토링 후 성능 저하가 없는지

---

## 6. 예상 결과

### Before (현재)
```
MapPane.tsx: 3,106 lines
- 모든 로직이 한 파일에
- 테스트 불가
- 유지보수 어려움
```

### After (리팩토링 후)
```
MapPane.tsx: ~200 lines
map-providers/
  - GoogleMapProvider.tsx: ~300 lines
  - KakaoMapProvider.tsx: ~400 lines
  - NaverMapProvider.tsx: ~300 lines
streetview/
  - GoogleStreetView.tsx: ~150 lines
  - KakaoRoadView.tsx: ~200 lines
  - NaverPanorama.tsx: ~200 lines
gis-tools/
  - DistanceMeasure.tsx: ~200 lines
  - AreaMeasure.tsx: ~200 lines
  - CadastralOverlay.tsx: ~300 lines
hooks/
  - useMapSync.ts: ~100 lines
  - useStreetView.ts: ~150 lines
  - useMapProvider.ts: ~150 lines
```

**총 라인 수**: 비슷하지만 **구조가 명확하고 유지보수가 쉬움**

---

## 7. 추가 개선 사항

### 7.1 에러 처리 강화

각 Provider에 에러 처리 추가:
```typescript
try {
  await provider.init(config);
} catch (error) {
  console.error(`Failed to initialize ${config.type} map:`, error);
  // 사용자에게 알림 표시
}
```

### 7.2 타입 안정성 강화

`any` 타입 제거:
```typescript
// Before
const mapRef = useRef<any>(null);

// After
const mapRef = useRef<google.maps.Map | null>(null);
```

### 7.3 상수 분리

매직 넘버를 상수로:
```typescript
// constants/mapConstants.ts
export const LOCATION_THRESHOLD = 0.0001; // 약 11m
export const SDK_CHECK_INTERVAL = 300; // ms
export const MINIMAP_SIZE = { width: 240, height: 240 };
```

---

## 8. 결론

**추천 전략**: 하이브리드 접근법 (제공자별 분리 + 커스텀 훅)

**주요 이점**:
- ✅ 코드 가독성 향상
- ✅ 테스트 가능성 개선
- ✅ 유지보수성 향상
- ✅ 확장성 향상
- ✅ 재사용성 향상

**예상 시간**: 7-10일 (점진적 마이그레이션)

**우선순위**: 
1. BaseMapProvider 인터페이스 정의
2. GoogleMapProvider 구현 (가장 단순)
3. KakaoMapProvider 구현 (가장 복잡)
4. NaverMapProvider 구현
5. MapPane.tsx 리팩토링
