import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        strictPort: true, // 포트가 사용 중이면 에러 발생 (자동으로 다른 포트 찾지 않음)
        // 구글 드라이브 폴더에서의 파일 감시 최적화
        watch: {
          // 구글 드라이브 동기화 파일 제외
          ignored: [
            '**/node_modules/**',
            '**/.git/**',
            '**/dist/**',
            // 구글 드라이브 메타데이터 파일 제외 (필요시)
            '**/.gsheet/**',
            '**/.gdoc/**',
          ],
          // 파일 감시 안정성 향상
          usePolling: false, // Windows에서 필요시 true로 변경
        },
        // ✅ VWorld API 프록시 (로컬 개발용)
        proxy: {
          '/api/vworld-boundaries': {
            target: 'https://api.vworld.kr',
            changeOrigin: true,
            rewrite: (path) => {
              // 실제로는 Vercel 서버리스 함수를 사용하므로 로컬에서는 직접 프록시
              // 배포 환경에서는 Vercel이 자동으로 서버리스 함수를 처리
              return path;
            },
            configure: (proxy, _options) => {
              proxy.on('proxyReq', (proxyReq, req, _res) => {
                // 로컬 개발 시에는 직접 VWorld API로 프록시하지 않고
                // JSONP 폴백을 사용하도록 함
                console.log('Local dev: Using JSONP fallback instead of proxy');
              });
            },
          },
        },
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      // 빌드 최적화
      build: {
        // 한글 경로 지원을 위한 설정
        outDir: 'dist',
        assetsDir: 'assets',
      },
    };
});
