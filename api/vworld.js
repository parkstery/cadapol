export default async function handler(req, res) {
  // CORS 처리: 모든 요청에 대해 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Preflight 요청(OPTIONS) 처리
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { searchParams } = new URL(req.url, `http://${req.headers.host}`);
  const lng = searchParams.get('lng');
  const lat = searchParams.get('lat');
  
  // API Key & Domain
  const VWORLD_KEY = '04FADF88-BBB0-3A72-8404-479547569E44'; 
  const DOMAIN = 'https://cadapol.vercel.app/';

  if (!lng || !lat) {
    return res.status(400).json({ error: 'Longitude and Latitude are required' });
  }

  // VWorld Data API 호출 URL
  const url = `https://api.vworld.kr/req/data?service=data&request=GetFeature&data=LP_PA_CB_ND_BU&key=${VWORLD_KEY}&geomFilter=POINT(${lng} ${lat})&geometry=true&domain=${DOMAIN}`;

  try {
    console.log(`Proxying request to VWorld: ${url}`);
    const response = await fetch(url);
    
    if (!response.ok) {
        throw new Error(`VWorld API responded with status ${response.status}`);
    }

    const data = await response.json();
    
    // 캐시 설정 강화 (Vercel Edge Caching)
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    
    return res.status(200).json(data);
  } catch (error) {
    console.error('VWorld Proxy Error:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}