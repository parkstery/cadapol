// api/kakao-route.ts
// Kakao Mobility Directions REST API 프록시

import type { VercelRequest, VercelResponse } from '@vercel/node';

const KAKAO_REST_API_KEY = '23767d8cc34ae4b4fc274f621cd85dc7';

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

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `KakaoAK ${KAKAO_REST_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Kakao Directions API error:', response.status, errorText);
      res.status(response.status).json({ 
        error: `Kakao API error: ${response.status}`,
        details: errorText 
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
