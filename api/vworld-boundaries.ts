// api/vworld-boundaries.ts
// Vercel 서버리스 함수: VWorld API 프록시 (CORS 우회)
// ✅ 행정경계 데이터는 정적 데이터로 취급하여 캐싱 적용

import type { VercelRequest, VercelResponse } from '@vercel/node';

const VWORLD_KEY = '04FADF88-BBB0-3A72-8404-479547569E44';
const ALLOWED_DOMAIN = 'https://cadapol.vercel.app/';

// ✅ 인메모리 캐시 (서버리스 함수 인스턴스 재사용 시 효과적)
// 행정경계 데이터는 거의 변경되지 않으므로 장기 캐싱 가능
interface CacheEntry {
  data: any;
  timestamp: number;
}

const cache: Map<string, CacheEntry> = new Map();

// 캐시 TTL: 24시간 (행정경계는 거의 변경되지 않음)
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24시간

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // OPTIONS 요청 처리 (CORS preflight)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET 요청만 허용
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // level 변수를 try 블록 밖으로 이동 (에러 로깅에서 사용하기 위해)
  const { level } = req.query;

  try {
    // 레벨 검증
    if (!level || (level !== 'sido' && level !== 'sigungu' && level !== 'emd')) {
      return res.status(400).json({ error: 'Invalid level parameter' });
    }

    // ✅ 캐시 확인 (행정경계는 정적 데이터이므로 캐싱 우선)
    const cacheKey = `boundary_${level}`;
    const cached = cache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      console.log(`[Cache HIT] Returning cached data for level: ${level}`);
      
      // 브라우저 캐싱을 위한 헤더 추가
      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400'); // 24시간
      res.setHeader('X-Cache', 'HIT');
      
      return res.status(200).json(cached.data);
    }

    console.log(`[Cache MISS] Fetching from VWorld API for level: ${level}`);

    // 데이터셋 선택
    let dataSet = '';
    switch (level) {
      case 'sido':
        dataSet = 'LT_C_ADSIDO_INFO';
        break;
      case 'sigungu':
        dataSet = 'LT_C_ADSIGG_INFO';
        break;
      case 'emd':
        dataSet = 'LT_C_ADEMD_INFO';
        break;
    }

    // VWorld API URL 구성
    // ✅ 테스트용: dong(emd) 레벨일 때는 bbox 파라미터 포함 (자문단 권장 - 가장 안정적)
    // sido/sigungu는 전체 데이터 조회 (캐싱 활용)
    const { bbox } = req.query;
    
    let url = `https://api.vworld.kr/req/data?service=data&version=2.0&request=GetFeature&data=${dataSet}&key=${VWORLD_KEY}&domain=${encodeURIComponent(ALLOWED_DOMAIN)}&crs=EPSG:4326&format=json&errorFormat=json&geometry=true`;

    // dong(emd) 레벨: bbox 파라미터 포함 (가장 안정적인 방법)
    if (level === 'emd' && bbox && typeof bbox === 'string') {
      url += `&bbox=${bbox}`;
      console.log(`[Test Mode] Using bbox parameter for dong level:`, bbox);
    } else if (level === 'sigungu') {
      // 시군구: size 제한 추가
      url += `&size=1000`;
    }
    // sido: size 제한 없음 (17개 정도)

    // VWorld API 호출 (타임아웃 설정)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000); // 25초 타임아웃
    
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Cadapol/1.0'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Failed to read error response');
        console.error(`VWorld API HTTP error: ${response.status}`);
        console.error('Error response:', errorText);
        console.error('Request URL:', url);
        
        // ✅ 503 에러 발생 시 캐시된 데이터가 있으면 반환
        if (response.status === 503) {
          const cached = cache.get(cacheKey);
          if (cached) {
            console.log(`[Cache FALLBACK] Returning stale cache due to 503 error for level: ${level}`);
            res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600'); // 1시간 (stale)
            res.setHeader('X-Cache', 'STALE');
            res.setHeader('X-Cache-Status', 'fallback-due-to-503');
            return res.status(200).json(cached.data);
          }
        }
        
        return res.status(500).json({ 
          error: `VWorld API error: ${response.status}`,
          details: errorText.substring(0, 500),
          url: url.substring(0, 200)
        });
      }

      // 응답 본문 읽기
      let responseText = '';
      let data: any = null;
      
      try {
        responseText = await response.text();
        if (!responseText) {
          throw new Error('Empty response from VWorld API');
        }
        data = JSON.parse(responseText);
      } catch (parseError: any) {
        console.error('Failed to parse VWorld API response:', parseError);
        console.error('Response text:', responseText.substring(0, 1000));
        return res.status(500).json({ 
          error: 'Failed to parse API response',
          details: parseError.message,
          responsePreview: responseText.substring(0, 500)
        });
      }

      // 응답 검증
      if (!data || !data.response) {
        console.error('Invalid response structure:', JSON.stringify(data).substring(0, 500));
        return res.status(500).json({ error: 'Invalid API response format' });
      }

      if (data.response.status !== 'OK') {
        console.error('VWorld API error:', data.response);
        return res.status(500).json({ 
          error: `API error: ${data.response.status}`,
          response: data.response
        });
      }

      // ✅ 캐시에 저장 (행정경계는 정적 데이터이므로 장기 캐싱)
      cache.set(cacheKey, {
        data: data,
        timestamp: Date.now()
      });
      console.log(`[Cache SET] Cached data for level: ${level}`);

      // 브라우저 캐싱을 위한 헤더 추가
      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400'); // 24시간
      res.setHeader('X-Cache', 'MISS');

      // 성공 응답
      return res.status(200).json(data);
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      
      // 타임아웃 에러 처리
      if (fetchError.name === 'AbortError') {
        console.error('VWorld API request timeout');
        return res.status(504).json({ 
          error: 'Gateway Timeout',
          message: 'VWorld API request timed out after 25 seconds'
        });
      }
      
      // 네트워크 연결 에러 처리
      if (fetchError.code === 'UND_ERR_SOCKET' || fetchError.message?.includes('fetch failed')) {
        console.error('VWorld API connection failed:', fetchError);
        console.error('Socket details:', fetchError.cause?.socket || 'No socket info');
        
        // ✅ 503 에러 발생 시 캐시된 데이터가 있으면 반환 (서비스 중단 시에도 사용 가능)
        const cached = cache.get(cacheKey);
        if (cached) {
          console.log(`[Cache FALLBACK] Returning stale cache due to 503 error for level: ${level}`);
          res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600'); // 1시간 (stale)
          res.setHeader('X-Cache', 'STALE');
          res.setHeader('X-Cache-Status', 'fallback-due-to-503');
          return res.status(200).json(cached.data);
        }
        
        return res.status(503).json({ 
          error: 'Service Unavailable',
          message: 'Failed to connect to VWorld API. The service may be temporarily unavailable.',
          details: fetchError.cause?.message || fetchError.message,
          code: fetchError.code || 'CONNECTION_ERROR'
        });
      }
      
      throw fetchError;
    }
  } catch (error) {
    const errorObj = error as Error;
    console.error('VWorld API proxy error:', errorObj);
    console.error('Error name:', errorObj.name);
    console.error('Error message:', errorObj.message);
    console.error('Error stack:', errorObj.stack);
    console.error('Request params:', { level });
    
    // 에러 타입별 처리
    const errorMessage = errorObj.message || 'Unknown error';
    const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('aborted') || errorObj.name === 'AbortError';
    
    // Vercel 서버리스 함수 실행 실패를 위한 상세 정보
    return res.status(isTimeout ? 504 : 500).json({ 
      error: isTimeout ? 'Gateway Timeout' : 'Internal server error',
      message: errorMessage,
      errorName: errorObj.name || 'Error',
      details: errorObj.stack || 'No stack trace available',
      timestamp: new Date().toISOString()
    });
  }
}
