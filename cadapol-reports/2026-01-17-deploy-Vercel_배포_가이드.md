# Vercel 배포 가이드

## 문제 상황
VWorld API는 도메인 제한이 있어 `localhost:3000`에서는 작동하지 않습니다.
- VWorld API Key는 `https://cadapol.vercel.app/` 도메인에만 허용되어 있습니다.
- 따라서 로컬 개발 환경에서는 지적 경계 폴리곤 기능을 테스트할 수 없습니다.

## 해결 방법: Vercel 배포

### 1. Vercel 계정 준비
1. [Vercel](https://vercel.com)에 가입/로그인
2. GitHub 계정과 연동 (권장)

### 2. 배포 방법

#### 방법 A: Vercel CLI 사용 (권장)

1. **Vercel CLI 설치**
```bash
npm install -g vercel
```

2. **프로젝트 디렉토리에서 로그인**
```bash
vercel login
```

3. **배포**
```bash
vercel
```

4. **프로덕션 배포**
```bash
vercel --prod
```

#### 방법 B: GitHub 연동 (자동 배포)

1. **GitHub에 프로젝트 푸시**
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin <your-github-repo-url>
git push -u origin main
```

2. **Vercel 대시보드에서 프로젝트 import**
   - [Vercel Dashboard](https://vercel.com/dashboard) 접속
   - "Add New..." → "Project" 클릭
   - GitHub 저장소 선택
   - 프로젝트 설정:
     - Framework Preset: Vite
     - Root Directory: ./
     - Build Command: `npm run build`
     - Output Directory: `dist`
   - "Deploy" 클릭

### 3. 도메인 설정 확인

배포 후 Vercel이 자동으로 도메인을 할당합니다:
- 예: `your-project-name.vercel.app`

**기존 `cadapol.vercel.app` 도메인 사용하려면:**
1. Vercel 대시보드 → 프로젝트 → Settings → Domains
2. 기존 도메인을 이 프로젝트에 연결
3. 또는 새 프로젝트 이름을 `cadapol`로 설정

### 4. 환경 변수 설정 (필요시)

Vercel 대시보드 → 프로젝트 → Settings → Environment Variables에서:
- `GEMINI_API_KEY` (이미 사용 중인 경우)

### 5. 배포 확인

배포 완료 후:
1. 배포된 URL 접속
2. 카카오맵 클릭
3. 콘솔에서 다음 로그 확인:
   - "Step1: PNU retrieved [PNU값]"
   - "Step2: Geometry retrieved Polygon"
   - "Cadastral polygon drawn successfully"
4. 지적 경계 폴리곤이 표시되는지 확인

## 배포 후 테스트 체크리스트

- [ ] 배포 URL 접속 성공
- [ ] 카카오맵 로드 성공
- [ ] 지도 클릭 시 마커 표시
- [ ] 인포윈도우 표시 (주소, 좌표)
- [ ] 콘솔에 "Step1: PNU retrieved" 로그 확인
- [ ] 콘솔에 "Step2: Geometry retrieved" 로그 확인
- [ ] 지적 경계 폴리곤 표시 확인
- [ ] 폴리곤 색상이 오렌지색인지 확인

## 문제 해결

### 배포 실패 시
1. 빌드 로그 확인
2. `npm run build` 로컬에서 실행하여 에러 확인
3. `vercel.json` 설정 확인

### API 에러 지속 시
1. Vercel 배포 URL이 `https://cadapol.vercel.app/`와 정확히 일치하는지 확인
2. VWorld API Key가 해당 도메인에 등록되어 있는지 확인
3. 브라우저 콘솔에서 네트워크 요청 확인

## 참고

- Vercel 문서: https://vercel.com/docs
- Vite 배포 가이드: https://vitejs.dev/guide/static-deploy.html#vercel
