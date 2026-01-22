// api/vworld-boundaries-point.ts
// Vercel 서버리스 함수: 좌표 기반 읍면동 행정경계 조회 (geomFilter=POINT 사용)

import type { VercelRequest, VercelResponse } from '@vercel/node';

const VWORLD_KEY = '04FADF88-BBB0-3A72-8404-479547569E44';
const ALLOWED_DOMAIN = 'https://cadapol.vercel.app/';

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

  try {
    const { lat, lng } = req.query;

    // 파라미터 검증
    if (!lat || !lng) {
      return res.status(400).json({ 
        error: 'Missing parameters',
        message: 'Both lat and lng parameters are required'
      });
    }

    const latNum = parseFloat(lat as string);
    const lngNum = parseFloat(lng as string);

    if (isNaN(latNum) || isNaN(lngNum)) {
      return res.status(400).json({ 
        error: 'Invalid parameters',
        message: 'lat and lng must be valid numbers'
      });
    }

    // ✅ 좌표 기반 읍면동 조회: geomFilter=POINT 사용 (bbox 없이 안정적)
    // 샘플 코드와 동일한 방식 (LP_PA_CBND_BUBUN에서 사용하는 패턴)
    const dataSet = 'LT_C_ADEMD_INFO'; // 읍면동 데이터셋
    const url = `https://api.vworld.kr/req/data?service=data&version=2.0&request=GetFeature&data=${dataSet}&key=${VWORLD_KEY}&geomFilter=POINT(${lngNum} ${latNum})&domain=${encodeURIComponent(ALLOWED_DOMAIN)}&crs=EPSG:4326&format=json&errorFormat=json&geometry=true`;

    console.log(`[Boundary] VWorld API point query: lat=${latNum}, lng=${lngNum}`);

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
    console.error('Request params:', { lat, lng });
    
    const errorMessage = errorObj.message || 'Unknown error';
    const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('aborted') || errorObj.name === 'AbortError';
    
    return res.status(isTimeout ? 504 : 500).json({ 
      error: isTimeout ? 'Gateway Timeout' : 'Internal server error',
      message: errorMessage,
      errorName: errorObj.name || 'Error',
      details: errorObj.stack || 'No stack trace available',
      timestamp: new Date().toISOString()
    });
  }
}
