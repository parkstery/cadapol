# VWorld API 샘플 소스 분석 보고서

**작성일**: 2026년 1월 22일  
**프로젝트명**: Cadapol (Advanced Dual Map Viewer)  
**분석 대상**: `reference/Vworld-cadastral-polygon-creation/index.tsx`

---

## 📋 목차

1. [샘플 소스 개요](#1-샘플-소스-개요)
2. [주요 발견 사항](#2-주요-발견-사항)
3. [지적 경계 vs 행정경계 비교](#3-지적-경계-vs-행정경계-비교)
4. [JSONP 패턴 분석](#4-jsonp-패턴-분석)
5. [현재 문제점](#5-현재-문제점)
6. [해결 방안](#6-해결-방안)

---

## 1. 샘플 소스 개요

### 1.1 파일 위치
- `reference/Vworld-cadastral-polygon-creation/index.tsx`

### 1.2 기능
- **지적 경계 폴리곤 표시** (Cadastral Boundary Polygon)
- 카카오맵에 클릭한 위치의 지적 정보를 조회하고 폴리곤으로 표시

### 1.3 사용 데이터셋
- **`LP_PA_CBND_BUBUN`** (지적 경계 데이터)
- **JSONP 방식 지원** ✅

---

## 2. 주요 발견 사항

### 2.1 ✅ 지적 경계는 JSONP 지원

**샘플 코드의 JSONP 패턴** (Line 177-205):
```typescript
const fetchCadastralInfoStep1 = (lng: number, lat: number, currentMap: any) => {
  const callbackName = `vworld_step1_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  
  (window as any)[callbackName] = (data: any) => {
    delete (window as any)[callbackName];
    document.getElementById(callbackName)?.remove();
    
    if (data.response && data.response.status === 'OK') {
      // 성공 처리
    }
  };

  const script = document.createElement('script');
  script.id = callbackName;
  script.src = `https://api.vworld.kr/req/data?service=data&request=GetFeature&data=LP_PA_CBND_BUBUN&key=${VWORLD_KEY}&geomFilter=POINT(${lng} ${lat})&domain=${encodeURIComponent(ALLOWED_DOMAIN)}&crs=EPSG:4326&format=json&errorFormat=json&geometry=false&callback=${callbackName}`;
  document.body.appendChild(script);
};
```

**핵심 포인트**:
- `callback=${callbackName}` 파라미터 포함
- 전역 콜백 함수 등록
- 스크립트 태그로 동적 로드
- 콜백 실행 후 즉시 정리

---

### 2.2 ❌ 행정경계는 JSONP 미지원

**현재 사용 중인 행정경계 데이터셋**:
- `LT_C_ADSIDO_INFO` (시도)
- `LT_C_ADSIGG_INFO` (시군구)
- `LT_C_ADEMD_INFO` (읍면동)

**증거**:
- 샘플 코드에는 행정경계 데이터셋 사용 예제 없음
- 실제 오류: `Uncaught SyntaxError: Unexpected identifier 'Y'`
- 이는 JSONP가 아닌 일반 JSON 응답을 스크립트로 파싱하려 할 때 발생

---

## 3. 지적 경계 vs 행정경계 비교

| 항목 | 지적 경계 (`LP_PA_CBND_BUBUN`) | 행정경계 (`LT_C_ADSIDO_INFO`) |
|------|-------------------------------|-------------------------------|
| **JSONP 지원** | ✅ 지원 | ❌ 미지원 |
| **CORS 지원** | ❌ 미지원 | ❌ 미지원 |
| **샘플 코드** | ✅ 있음 | ❌ 없음 |
| **API 응답 형식** | JSONP (callback 포함) | 일반 JSON (callback 무시) |
| **해결 방법** | JSONP 직접 사용 | 서버 프록시 필요 |

---

## 4. JSONP 패턴 분석

### 4.1 샘플 코드의 JSONP 패턴

**1단계: 콜백 함수 생성**
```typescript
const callbackName = `vworld_step1_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
```

**2단계: 전역 콜백 등록**
```typescript
(window as any)[callbackName] = (data: any) => {
  // 응답 처리
  delete (window as any)[callbackName];
  document.getElementById(callbackName)?.remove();
};
```

**3단계: 스크립트 태그 생성 및 로드**
```typescript
const script = document.createElement('script');
script.id = callbackName;
script.src = `https://api.vworld.kr/req/data?...&callback=${callbackName}`;
document.body.appendChild(script);
```

**4단계: 정리**
- 콜백 실행 후 즉시 삭제
- 스크립트 태그 제거

---

### 4.2 현재 행정경계 코드와의 차이점

**현재 코드** (`vworldApi.ts`):
- 동일한 JSONP 패턴 사용
- 하지만 행정경계 데이터셋은 JSONP를 지원하지 않음
- 결과: `Unexpected identifier 'Y'` 오류 발생

**원인**:
- VWorld API가 행정경계 데이터셋에 대해 JSONP를 반환하지 않음
- 일반 JSON 응답이 스크립트 태그로 로드되어 파싱 오류 발생

---

## 5. 현재 문제점

### 5.1 🔴 주요 문제

1. **행정경계 데이터셋은 JSONP 미지원**
   - `LT_C_ADSIDO_INFO` 등은 JSONP를 지원하지 않음
   - 샘플 코드에도 행정경계 예제 없음

2. **프록시가 제대로 작동하지 않음**
   - 프로덕션 환경 감지 로직이 실패할 수 있음
   - 프록시 실패 시 JSONP 폴백으로 넘어가지만, JSONP도 실패

3. **에러 처리 부족**
   - 프록시 실패 원인 파악 어려움
   - 사용자에게 명확한 피드백 없음

---

### 5.2 현재 코드의 문제점

**`vworldApi.ts` Line 46-53**:
```typescript
const isProduction = window.location.hostname === 'cadapol.vercel.app' || 
                     window.location.hostname.includes('vercel.app');

if (!isProduction) {
  throw new Error('Local dev: Use JSONP fallback');
}
```

**문제**:
- 로컬 개발 환경에서 프록시를 시도하지 않음
- 하지만 로컬에서도 프록시를 테스트할 수 있어야 함
- Vercel CLI로 로컬 서버리스 함수 실행 가능

---

## 6. 해결 방안

### 6.1 ✅ 즉시 적용 가능한 해결책

**1. 프록시를 항상 우선 시도**
```typescript
static async getAdministrativeBoundaries(...): Promise<AdministrativeBoundary[]> {
  // ✅ 프록시를 항상 먼저 시도
  try {
    return await this.getAdministrativeBoundariesViaProxy(level, bounds);
  } catch (error) {
    console.warn('VWorld API: Proxy failed', error);
    // ❌ JSONP 폴백 제거 (행정경계는 JSONP 미지원)
    throw new Error('Failed to load administrative boundaries via proxy. Please check server configuration.');
  }
}
```

**2. 프로덕션 환경 감지 로직 제거**
```typescript
private static async getAdministrativeBoundariesViaProxy(...): Promise<AdministrativeBoundary[]> {
  // ✅ 환경 감지 제거, 항상 프록시 시도
  let url = `/api/vworld-boundaries?level=${level}`;
  
  if (bounds) {
    const bbox = `${bounds.minLng},${bounds.minLat},${bounds.maxLng},${bounds.maxLat}`;
    url += `&bbox=${encodeURIComponent(bbox)}`;
  }
  
  const response = await fetch(url);
  // ...
}
```

**3. JSONP 폴백 제거**
- 행정경계는 JSONP를 지원하지 않으므로 폴백 제거
- 프록시만 사용

---

### 6.2 ✅ 서버리스 함수 개선

**`api/vworld-boundaries.ts` 개선 사항**:

1. **더 상세한 에러 로깅**
```typescript
catch (error) {
  console.error('VWorld API proxy error:', error);
  console.error('Request URL:', url);
  console.error('Request params:', { level, bbox });
  return res.status(500).json({ 
    error: 'Internal server error',
    message: (error as Error).message,
    details: process.env.NODE_ENV === 'development' ? (error as Error).stack : undefined
  });
}
```

2. **응답 형식 검증 강화**
```typescript
if (!data || !data.response) {
  console.error('Invalid response structure:', JSON.stringify(data).substring(0, 500));
  return res.status(500).json({ error: 'Invalid API response format' });
}
```

---

### 6.3 ✅ 클라이언트 에러 처리 개선

**`vworldApi.ts` 개선**:
```typescript
private static async getAdministrativeBoundariesViaProxy(...): Promise<AdministrativeBoundary[]> {
  let url = `/api/vworld-boundaries?level=${level}`;
  
  if (bounds) {
    const bbox = `${bounds.minLng},${bounds.minLat},${bounds.maxLng},${bounds.maxLat}`;
    url += `&bbox=${encodeURIComponent(bbox)}`;
  }
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('Proxy error details:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      });
      throw new Error(`Proxy error: ${response.status} - ${errorData.error || 'Unknown error'}`);
    }
    
    const data = await response.json();
    // ... 나머지 처리
  } catch (error) {
    console.error('Proxy fetch failed:', error);
    console.error('Request URL:', url);
    throw error;
  }
}
```

---

## 7. 결론

### 7.1 핵심 발견

1. **샘플 코드는 지적 경계만 다룸**
   - `LP_PA_CBND_BUBUN` 데이터셋 사용
   - JSONP 지원 ✅

2. **행정경계는 JSONP 미지원**
   - `LT_C_ADSIDO_INFO` 등은 JSONP를 지원하지 않음
   - 서버 프록시 필수

3. **현재 프록시 구현은 올바름**
   - 하지만 환경 감지 로직이 문제
   - JSONP 폴백이 불필요 (실패만 함)

### 7.2 권장 조치

1. ✅ **프록시를 항상 우선 시도** (환경 감지 제거)
2. ✅ **JSONP 폴백 제거** (행정경계는 JSONP 미지원)
3. ✅ **에러 로깅 강화** (디버깅 용이)
4. ✅ **서버리스 함수 배포 확인** (Vercel 배포 상태 확인)

### 7.3 예상 효과

- ✅ 프록시가 정상 작동하면 행정경계 표시 성공
- ✅ 에러 발생 시 원인 파악 용이
- ✅ 불필요한 JSONP 시도 제거로 성능 개선

---

**작성일**: 2026년 1월 22일  
**최종 수정일**: 2026년 1월 22일  
**문서 버전**: 1.0
