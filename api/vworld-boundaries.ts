// api/vworld-boundaries.ts
// Vercel 서버리스 함수: VWorld API 프록시 (CORS 우회)

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

    // VWorld API URL 구성
    let url = `https://api.vworld.kr/req/data?service=data&request=GetFeature&data=${dataSet}&key=${VWORLD_KEY}&domain=${encodeURIComponent(ALLOWED_DOMAIN)}&crs=EPSG:4326&format=json&errorFormat=json&geometry=true`;

    // bbox 파라미터 추가 (선택사항)
    if (bbox && typeof bbox === 'string') {
      url += `&bbox=${bbox}`;
    }

    // VWorld API 호출
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`VWorld API HTTP error: ${response.status}`, errorText);
      return res.status(response.status).json({ 
        error: `VWorld API error: ${response.status}`,
        details: errorText.substring(0, 200)
      });
    }

    const data = await response.json();

    // 응답 검증
    if (!data || !data.response) {
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
  } catch (error) {
    console.error('VWorld API proxy error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: (error as Error).message
    });
  }
}
