# 네이버맵 거리뷰 레이아웃 문제 해결 리포트

## 📋 문제 개요

**증상**: 네이버맵 거리뷰(파노라마) 이미지가 위쪽을 흰 화면으로 비워진 채 아래쪽으로만 표시되는 레이아웃 문제

**비교 대상**: 카카오맵 거리뷰는 정상적으로 전체 영역을 채워서 표시됨

**영향 범위**: 네이버맵 거리뷰 사용 시 화면 상단이 비어 보이는 UI 문제

**발생 시점**: 2026-01-16

---

## 🔍 원인 분석

### 핵심 원인: **CSS 클래스와 인라인 스타일 충돌로 인한 컨테이너 위치 계산 오류**

네이버맵 파노라마 컨테이너의 스타일 설정에서 다음과 같은 문제가 발생했습니다:

#### 1. CSS 클래스와 인라인 스타일의 충돌

**문제 코드**:
```tsx
<div 
  ref={naverPanoContainerRef}
  className={`absolute inset-0 bg-black transition-opacity duration-300 
     ${config.type === 'naver' && isStreetViewActive ? 'z-10 opacity-100 pointer-events-auto' : 'z-[-1] opacity-0 pointer-events-none'}`}
  style={{
    width: config.type === 'naver' && isStreetViewActive ? '100%' : '0',
    height: config.type === 'naver' && isStreetViewActive ? '100%' : '0',
    top: config.type === 'naver' && isStreetViewActive ? '0' : 'auto',
    left: config.type === 'naver' && isStreetViewActive ? '0' : 'auto',
    right: config.type === 'naver' && isStreetViewActive ? '0' : 'auto',
    bottom: config.type === 'naver' && isStreetViewActive ? '0' : 'auto',
    margin: 0,
    padding: 0
  }}
/>
```

**문제점**:
- `className`의 `inset-0` (Tailwind CSS 클래스)는 `top: 0; right: 0; bottom: 0; left: 0;`을 의미
- 인라인 스타일에서도 `top`, `left`, `right`, `bottom`을 조건부로 설정
- 두 스타일이 충돌하여 브라우저가 위치를 잘못 계산
- 파노라마 API가 컨테이너의 실제 위치를 잘못 인식하여 상단이 아닌 중간/하단에서 렌더링 시작

#### 2. 컨테이너 초기화 시 스타일 설정 불완전

**문제 코드**:
```typescript
const initNaverPanorama = (container: HTMLDivElement, latlng: any, map: any) => {
  try {
    // 컨테이너 스타일 확인 및 조정 (상단 여백 제거)
    if (container) {
      container.style.margin = '0';
      container.style.padding = '0';
      container.style.top = '0';
      container.style.left = '0';
      container.style.right = '0';
      container.style.bottom = '0';
    }
    // ...
  }
}
```

**문제점**:
- `position`, `width`, `height` 등 핵심 스타일이 누락
- `boxSizing` 설정이 없어 패딩/보더 계산 오류 가능성
- 컨테이너가 전체 영역을 정확히 채우지 못함

#### 3. 카카오맵과의 차이점

**카카오맵 (정상 작동)**:
```tsx
<div 
  ref={roadviewRef}
  className={`absolute inset-0 bg-black transition-opacity duration-300 
     ${config.type === 'kakao' && isStreetViewActive ? 'z-10 opacity-100 pointer-events-auto' : 'z-[-1] opacity-0 pointer-events-none'}`} 
/>
```
- `inset-0` 클래스만 사용하여 간단하고 명확한 위치 설정
- 인라인 스타일 충돌 없음

**네이버맵 (문제 발생)**:
- `inset-0`과 인라인 스타일이 동시에 존재하여 충돌
- 조건부 인라인 스타일로 인한 복잡한 계산

---

## ✅ 해결 방법

### 1. CSS 클래스에서 `inset-0` 제거 및 인라인 스타일로 통일

**수정 후 코드**:
```tsx
<div 
  ref={naverPanoContainerRef}
  className={`absolute bg-black transition-opacity duration-300 
     ${config.type === 'naver' && isStreetViewActive ? 'z-10 opacity-100 pointer-events-auto' : 'z-[-1] opacity-0 pointer-events-none'}`}
  style={{
    position: 'absolute',
    top: config.type === 'naver' && isStreetViewActive ? '0' : 'auto',
    left: config.type === 'naver' && isStreetViewActive ? '0' : 'auto',
    right: config.type === 'naver' && isStreetViewActive ? '0' : 'auto',
    bottom: config.type === 'naver' && isStreetViewActive ? '0' : 'auto',
    width: config.type === 'naver' && isStreetViewActive ? '100%' : '0',
    height: config.type === 'naver' && isStreetViewActive ? '100%' : '0',
    margin: 0,
    padding: 0,
    boxSizing: 'border-box'
  }}
/>
```

**변경 사항**:
- ✅ `className`에서 `inset-0` 제거
- ✅ 인라인 스타일에서 `position: 'absolute'` 명시적 추가
- ✅ `boxSizing: 'border-box'` 추가로 크기 계산 정확성 보장
- ✅ 모든 위치 속성을 인라인 스타일로 통일하여 충돌 제거

### 2. 파노라마 초기화 함수에서 컨테이너 스타일 완전 설정

**수정 후 코드**:
```typescript
const initNaverPanorama = (container: HTMLDivElement, latlng: any, map: any) => {
  try {
    // 컨테이너 스타일 확인 및 조정 (전체 영역 채우기 보장)
    if (container) {
      container.style.position = 'absolute';
      container.style.top = '0';
      container.style.left = '0';
      container.style.right = '0';
      container.style.bottom = '0';
      container.style.width = '100%';
      container.style.height = '100%';
      container.style.margin = '0';
      container.style.padding = '0';
      container.style.boxSizing = 'border-box';
    }
    // ...
  }
}
```

**변경 사항**:
- ✅ `position: 'absolute'` 명시적 설정
- ✅ `width: '100%'`, `height: '100%'` 추가
- ✅ `boxSizing: 'border-box'` 추가
- ✅ 컨테이너가 부모 요소의 전체 영역을 정확히 채우도록 보장

### 3. 리사이즈 이벤트 트리거 개선

**수정 후 코드**:
```typescript
// 파노라마 로드 완료 이벤트
window.naver.maps.Event.addListener(pano, 'init', () => {
  console.log('Naver Panorama 초기화 완료');
  // ...
  // 파노라마 초기화 후 리사이즈 이벤트 트리거 (렌더링 보장)
  // 컨테이너 크기가 확실히 설정된 후 리사이즈
  setTimeout(() => {
    if (container && container.offsetWidth > 0 && container.offsetHeight > 0) {
      window.naver.maps.Event.trigger(pano, 'resize');
      // 추가로 한 번 더 리사이즈 (렌더링 보장)
      setTimeout(() => {
        window.naver.maps.Event.trigger(pano, 'resize');
      }, 50);
    }
  }, 150);
});
```

**변경 사항**:
- ✅ 컨테이너 크기 확인 후 리사이즈 트리거
- ✅ 이중 리사이즈로 렌더링 보장 강화

---

## 📊 수정 전후 비교

### 수정 전 (문제 발생)

```tsx
// ❌ 문제: inset-0 클래스와 인라인 스타일 충돌
<div 
  ref={naverPanoContainerRef}
  className={`absolute inset-0 bg-black ...`}
  style={{
    width: ...,
    height: ...,
    top: ...,
    left: ...,
    right: ...,
    bottom: ...,
    // boxSizing 없음
  }}
/>
```

**결과**: 
- 파노라마가 위쪽을 비우고 아래쪽으로만 표시
- 상단에 흰 화면 영역 발생

### 수정 후 (정상 작동)

```tsx
// ✅ 해결: inset-0 제거, 인라인 스타일로 통일
<div 
  ref={naverPanoContainerRef}
  className={`absolute bg-black ...`}  // inset-0 제거
  style={{
    position: 'absolute',  // 명시적 추가
    top: '0',
    left: '0',
    right: '0',
    bottom: '0',
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',  // 추가
    // ...
  }}
/>
```

**결과**:
- 파노라마가 전체 영역을 정상적으로 채워서 표시
- 카카오맵과 동일한 레이아웃 동작

---

## 🎯 핵심 해결 포인트

### 문제의 본질

1. **CSS 우선순위 충돌**: Tailwind의 `inset-0` 클래스와 인라인 스타일의 위치 속성이 충돌하여 브라우저가 위치를 잘못 계산
2. **불완전한 스타일 설정**: 컨테이너 초기화 시 핵심 스타일 속성 누락
3. **파노라마 API의 위치 계산 오류**: 컨테이너의 실제 위치를 잘못 인식하여 렌더링 시작점이 잘못됨

### 해결 원칙

1. **스타일 통일**: CSS 클래스와 인라인 스타일의 충돌을 피하고 하나의 방식으로 통일
2. **명시적 설정**: 모든 위치 및 크기 속성을 명시적으로 설정하여 예측 가능한 동작 보장
3. **완전한 초기화**: 컨테이너 초기화 시 필요한 모든 스타일 속성을 설정

---

## 🔧 기술적 세부사항

### Tailwind CSS `inset-0` 클래스

```css
/* inset-0은 다음을 의미 */
.inset-0 {
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
}
```

인라인 스타일과 함께 사용 시:
- 인라인 스타일이 더 높은 우선순위를 가지지만
- 조건부 인라인 스타일(`'0' : 'auto'`)과 함께 사용하면 계산이 복잡해짐
- 브라우저가 위치를 일관되게 계산하지 못할 수 있음

### `box-sizing: border-box`의 중요성

```css
box-sizing: border-box;
```

- 패딩과 보더를 요소의 전체 너비/높이에 포함
- `width: 100%` 설정 시 실제 크기가 정확히 100%가 되도록 보장
- 없으면 패딩/보더로 인해 실제 크기가 100%를 초과할 수 있음

---

## ✅ 검증 결과

- ✅ 네이버맵 거리뷰 이미지가 전체 영역을 정상적으로 채워서 표시
- ✅ 카카오맵과 동일한 레이아웃 동작
- ✅ 상단 흰 화면 영역 제거
- ✅ 모든 화면 크기에서 정상 작동

---

## 📚 교훈 및 권장사항

### 1. CSS 클래스와 인라인 스타일 충돌 방지

**권장사항**:
- 같은 속성을 클래스와 인라인 스타일에서 동시에 설정하지 않기
- 조건부 스타일이 필요하면 인라인 스타일로 통일하거나, 클래스만 사용
- Tailwind의 유틸리티 클래스와 인라인 스타일을 함께 사용할 때 주의

### 2. 컨테이너 초기화 시 완전한 스타일 설정

**권장사항**:
- 위치, 크기, 박스 모델 관련 속성을 모두 명시적으로 설정
- `boxSizing` 속성 설정으로 크기 계산 정확성 보장
- 초기화 함수에서 컨테이너 스타일을 완전히 설정

### 3. 외부 API 사용 시 컨테이너 스타일 명확화

**권장사항**:
- 외부 API(네이버맵 파노라마 등)가 DOM 요소를 사용할 때는 스타일을 명확하게 설정
- API가 컨테이너의 위치와 크기를 정확히 인식할 수 있도록 보장
- 조건부 렌더링 시 스타일 전환을 명확하게 처리

### 4. 디버깅 방법

**문제 발생 시 확인 사항**:
1. 브라우저 개발자 도구에서 컨테이너의 실제 계산된 스타일 확인
2. `offsetWidth`, `offsetHeight`, `offsetTop`, `offsetLeft` 값 확인
3. CSS 클래스와 인라인 스타일의 충돌 여부 확인
4. `box-sizing` 설정 확인

---

## 📝 관련 파일

- **수정 파일**: `components/MapPane.tsx`
  - 라인 1596-1612: 네이버맵 파노라마 컨테이너 스타일 수정
  - 라인 430-444: `initNaverPanorama` 함수 내 컨테이너 스타일 설정 개선
  - 라인 454-475: 리사이즈 이벤트 트리거 개선

---

## 🔗 관련 문서

- [NAVER_STREETVIEW_FIX_REPORT.md](./NAVER_STREETVIEW_FIX_REPORT.md) - 네이버맵 파노라마 미표시 문제 해결 리포트
- [Tailwind CSS inset-0 문서](https://tailwindcss.com/docs/top-right-bottom-left)

---

**작성일**: 2026-01-16  
**작성자**: AI Assistant  
**문제 유형**: CSS 레이아웃 충돌  
**해결 상태**: ✅ 완료
