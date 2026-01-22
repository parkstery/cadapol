// api/vworld-boundaries.ts
// Vercel 서버리스 함수: VWorld API 프록시 (CORS 우회)

import type { VercelRequest, VercelResponse } from '@vercel/node';

const VWORLD_KEY = '80DCE32C-9A0E-359B-BF0A-9FD4E8D4D285';
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
    const { level, bbox } = req.query;

    // 레벨 검증
    if (!level || (level !== 'sido' && level !== 'sigungu' && level !== 'emd')) {
      return res.status(400).json({ error: 'Invalid level parameter' });
    }

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

    // VWorld API URL 구성 (버전 2.0 사용)
    let url = `https://api.vworld.kr/req/data?service=data&version=2.0&request=GetFeature&data=${dataSet}&key=${VWORLD_KEY}&domain=${encodeURIComponent(ALLOWED_DOMAIN)}&crs=EPSG:4326&format=json&errorFormat=json&geometry=true`;

    // bbox 파라미터 추가 (선택사항)
    if (bbox && typeof bbox === 'string') {
      url += `&bbox=${bbox}`;
    }

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
        console.error(`VWorld API HTTP error: ${response.status}`, errorText);
        return res.status(500).json({ 
          error: `VWorld API error: ${response.status}`,
          details: errorText.substring(0, 200),
          url: url.substring(0, 100) // URL 일부만 로그
        });
      }

      const data = await response.json();

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
      
      if (fetchError.name === 'AbortError') {
        console.error('VWorld API request timeout');
        return res.status(504).json({ 
          error: 'Gateway Timeout',
          message: 'VWorld API request timed out after 25 seconds'
        });
      }
      
      throw fetchError;
    }
  } catch (error) {
    console.error('VWorld API proxy error:', error);
    console.error('Request params:', { level, bbox });
    
    const errorMessage = (error as Error).message;
    const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('aborted');
    
    return res.status(isTimeout ? 504 : 500).json({ 
      error: isTimeout ? 'Gateway Timeout' : 'Internal server error',
      message: errorMessage,
      details: process.env.NODE_ENV === 'development' ? (error as Error).stack : undefined
    });
  }
}
