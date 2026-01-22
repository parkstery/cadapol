// api/kakao-route.ts
// Kakao Mobility Directions REST API 프록시

import type { VercelRequest, VercelResponse } from '@vercel/node';

// 환경 변수에서 REST API 키 가져오기 (Vercel Environment Variables에 설정 필요)
const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY || '23767d8cc34ae4b4fc274f621cd85dc7';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // REST API 키 확인 및 디버깅
  console.log('[KakaoRoute] Environment check:', {
    hasEnvVar: !!process.env.KAKAO_REST_API_KEY,
    envVarLength: process.env.KAKAO_REST_API_KEY?.length || 0,
    envVarPrefix: process.env.KAKAO_REST_API_KEY?.substring(0, 8) || 'N/A',
    usingFallback: !process.env.KAKAO_REST_API_KEY,
    finalKeyLength: KAKAO_REST_API_KEY.length,
    finalKeyPrefix: KAKAO_REST_API_KEY.substring(0, 8)
  });
  
  if (!KAKAO_REST_API_KEY || KAKAO_REST_API_KEY.trim() === '') {
    console.error('[KakaoRoute] KAKAO_REST_API_KEY is not set');
    res.status(500).json({ 
      error: 'Server configuration error',
      message: 'KAKAO_REST_API_KEY environment variable is not set'
    });
    return;
  }

  try {
    const { origin, destination, waypoints, summary } = req.body;

    if (!origin || !destination) {
      res.status(400).json({ error: 'Origin and destination are required' });
      return;
    }

    // Kakao Mobility Directions API 요청 구성
    const requestBody: any = {
      origin: {
        x: origin.lng || origin.x,
        y: origin.lat || origin.y
      },
      destination: {
        x: destination.lng || destination.x,
        y: destination.lat || destination.y
      }
    };

    // 경유지가 있으면 추가
    if (waypoints && waypoints.length > 0) {
      requestBody.waypoints = waypoints.map((wp: any) => ({
        x: wp.lng || wp.x,
        y: wp.lat || wp.y
      }));
    }

    // 이동 수단 (summary: 'driving' 또는 'walking')
    if (summary) {
      requestBody.summary = summary;
    }

    const apiUrl = 'https://apis-navi.kakaomobility.com/v1/directions';
    
    // Authorization 헤더 형식: "KakaoAK {REST_API_KEY}" (공백 포함, 정확한 형식 필수)
    const trimmedKey = KAKAO_REST_API_KEY.trim();
    const authHeader = `KakaoAK ${trimmedKey}`;
    
    console.log('[KakaoRoute] Request to Kakao API:', {
      url: apiUrl,
      hasKey: !!KAKAO_REST_API_KEY,
      keyLength: KAKAO_REST_API_KEY.length,
      keyPrefix: KAKAO_REST_API_KEY.substring(0, 8) + '...',
      keySuffix: '...' + KAKAO_REST_API_KEY.substring(KAKAO_REST_API_KEY.length - 4),
      authHeaderFormat: authHeader.substring(0, 20) + '...',
      requestBody: JSON.stringify(requestBody).substring(0, 200)
    });

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errorJson = (() => {
        try {
          return JSON.parse(errorText);
        } catch {
          return { raw: errorText };
        }
      })();
      
      console.error('[KakaoRoute] Kakao Directions API error:', {
        status: response.status,
        statusText: response.statusText,
        errorText: errorText.substring(0, 500),
        errorJson: errorJson,
        authHeaderFormat: authHeader.substring(0, 20) + '...',
        keyUsed: trimmedKey.substring(0, 8) + '...' + trimmedKey.substring(trimmedKey.length - 4),
        requestUrl: apiUrl,
        requestMethod: 'POST'
      });
      
      // 401 오류인 경우 상세한 안내 메시지 제공
      if (response.status === 401) {
        res.status(401).json({ 
          error: 'Unauthorized',
          message: 'Kakao Directions API authentication failed. Please check:',
          checks: [
            '1. KAKAO_REST_API_KEY environment variable is set correctly in Vercel',
            '2. The key is a REST API key (not JavaScript key) - should be 32 characters',
            '3. Kakao Developers → 내 애플리케이션 → 제품 설정 → Kakao Mobility → 길찾기(Directions) 활성화',
            '4. Authorization header format is "KakaoAK {KEY}" (with space)',
            '5. Vercel project was redeployed after setting environment variable',
            '6. Check Vercel Functions logs to see which key is actually being used'
          ],
          debug: {
            keyLength: trimmedKey.length,
            keyPrefix: trimmedKey.substring(0, 8),
            keySuffix: trimmedKey.substring(trimmedKey.length - 4),
            authHeaderFormat: authHeader.substring(0, 25),
            usingEnvVar: !!process.env.KAKAO_REST_API_KEY
          },
          details: errorJson
        });
        return;
      }
      
      res.status(response.status).json({ 
        error: `Kakao API error: ${response.status}`,
        details: errorText.substring(0, 500)
      });
      return;
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    console.error('Kakao route proxy error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
