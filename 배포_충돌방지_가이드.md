# 배포 충돌 방지 가이드

## 현재 상황
- **레퍼런스 코드**: `parkstery/cadapol` 저장소 → `https://cadapol.vercel.app/` 배포됨
- **현재 프로젝트**: `parkstery/cc-dmv2` 저장소
- **목표**: 현재 프로젝트의 지적 경계 폴리곤 기능을 `cadapol.vercel.app`에 배포

## 충돌 문제 분석

### 문제점
1. **다른 저장소**: `cc-dmv2`와 `cadapol`은 별도의 저장소
2. **같은 도메인**: `cadapol.vercel.app`은 이미 `parkstery/cadapol` 프로젝트에 연결됨
3. **Vercel CLI 배포 시**: 새 프로젝트로 배포되면 다른 도메인 할당됨

### 해결 방법

## 방법 1: 기존 cadapol 저장소에 푸시 (권장) ✅

이 방법이 가장 안전하고 기존 설정과 충돌하지 않습니다.

### 단계별 가이드

#### 1단계: cadapol 저장소를 remote로 추가
```bash
# 기존 origin 확인 (cc-dmv2)
git remote -v

# cadapol 저장소를 새로운 remote로 추가
git remote add cadapol https://github.com/parkstery/cadapol.git

# 확인
git remote -v
```

#### 2단계: 현재 변경사항 커밋
```bash
# 변경사항 확인
git status

# 변경사항 추가
git add .

# 커밋
git commit -m "Add cadastral polygon feature to Kakao Map"
```

#### 3단계: cadapol 저장소에 푸시
```bash
# cadapol 저장소의 main 브랜치에 푸시
git push cadapol main
```

#### 4단계: Vercel 자동 재배포 확인
- `parkstery/cadapol` 저장소에 푸시하면
- Vercel이 자동으로 감지하여 재배포
- `https://cadapol.vercel.app/`에 새 버전 배포됨

### 장점
- ✅ 기존 도메인 유지 (`cadapol.vercel.app`)
- ✅ Vercel 설정 충돌 없음
- ✅ 자동 배포로 편리함
- ✅ 기존 레퍼런스 코드와 분리 관리 가능

---

## 방법 2: Vercel CLI로 기존 프로젝트에 연결

### 단계별 가이드

#### 1단계: Vercel CLI 설치 및 로그인
```bash
npm install -g vercel
vercel login
```

#### 2단계: 기존 프로젝트에 연결
```bash
vercel link
```

질문에 답변:
- **Link to existing project?** → **Y**
- **What's the name of your existing project?** → **cadapol** (또는 기존 프로젝트 이름)

#### 3단계: 배포
```bash
vercel --prod
```

### 장점
- ✅ 기존 프로젝트 설정 유지
- ✅ 같은 도메인 사용 가능

### 주의사항
- ⚠️ 기존 배포를 덮어씀
- ⚠️ 레퍼런스 코드와 충돌 가능

---

## 방법 3: 별도 도메인 사용 (충돌 완전 회피)

현재 프로젝트를 새 Vercel 프로젝트로 배포하고 도메인 설정 변경

### 단계별 가이드

#### 1단계: 새 프로젝트로 배포
```bash
vercel
# 프로젝트 이름: cc-dmv2 (또는 다른 이름)
```

#### 2단계: ALLOWED_DOMAIN 수정
`components/MapPane.tsx`에서:
```typescript
const ALLOWED_DOMAIN = 'https://cc-dmv2.vercel.app/'; // 새 도메인
```

#### 3단계: VWorld API에 새 도메인 등록
- VWorld API 관리 페이지에서 새 도메인 추가
- 또는 기존 도메인에 새 도메인 추가

### 장점
- ✅ 완전히 독립적인 배포
- ✅ 기존 프로젝트와 충돌 없음

### 단점
- ❌ VWorld API 도메인 등록 필요
- ❌ 다른 도메인 사용

---

## 권장 방법: 방법 1 (기존 저장소에 푸시)

**이유:**
1. 기존 `cadapol.vercel.app` 도메인 유지
2. Vercel 자동 배포 활용
3. 충돌 없이 안전하게 배포
4. 레퍼런스 코드와 현재 프로젝트 분리 관리

**실행 순서:**
```bash
# 1. cadapol 저장소 추가
git remote add cadapol https://github.com/parkstery/cadapol.git

# 2. 변경사항 커밋
git add .
git commit -m "Add cadastral polygon feature"

# 3. cadapol 저장소에 푸시
git push cadapol main
```

이후 Vercel이 자동으로 재배포합니다.
