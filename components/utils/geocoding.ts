// utils/geocoding.ts

/**
 * 지명을 좌표로 변환하는 유틸리티
 */

export interface GeocodeResult {
  lat: number;
  lng: number;
  address: string;
  placeName?: string;
}

/**
 * 카카오 지명 검색
 */
export async function geocodeKakao(query: string): Promise<GeocodeResult | null> {
  return new Promise((resolve) => {
    if (!window.kakao || !window.kakao.maps || !window.kakao.maps.services) {
      resolve(null);
      return;
    }

    const geocoder = new window.kakao.maps.services.Geocoder();
    
    geocoder.addressSearch(query, (result: any[], status: any) => {
      if (status === window.kakao.maps.services.Status.OK && result.length > 0) {
        const item = result[0];
        resolve({
          lat: parseFloat(item.y),
          lng: parseFloat(item.x),
          address: item.address_name,
          placeName: item.place_name
        });
      } else {
        // 장소 검색 시도
        const places = new window.kakao.maps.services.Places();
        places.keywordSearch(query, (data: any[], status: any) => {
          if (status === window.kakao.maps.services.Status.OK && data.length > 0) {
            const item = data[0];
            resolve({
              lat: parseFloat(item.y),
              lng: parseFloat(item.x),
              address: item.address_name,
              placeName: item.place_name
            });
          } else {
            resolve(null);
          }
        });
      }
    });
  });
}

/**
 * 구글 지명 검색
 */
export async function geocodeGoogle(query: string): Promise<GeocodeResult | null> {
  return new Promise((resolve) => {
    if (!window.google || !window.google.maps) {
      resolve(null);
      return;
    }

    const geocoder = new window.google.maps.Geocoder();
    
    geocoder.geocode({ address: query }, (results, status) => {
      if (status === window.google.maps.GeocoderStatus.OK && results && results.length > 0) {
        const result = results[0];
        const location = result.geometry.location;
        resolve({
          lat: location.lat(),
          lng: location.lng(),
          address: result.formatted_address,
          placeName: result.name
        });
      } else {
        // Places API 시도 (API 키 필요)
        resolve(null);
      }
    });
  });
}

/**
 * 네이버 지명 검색
 */
export async function geocodeNaver(query: string): Promise<GeocodeResult | null> {
  return new Promise((resolve) => {
    if (!window.naver || !window.naver.maps) {
      resolve(null);
      return;
    }

    // 네이버는 직접 Geocoding API가 없으므로 카카오를 사용
    geocodeKakao(query).then(resolve);
  });
}

/**
 * 통합 지명 검색 (여러 제공자 시도)
 */
export async function geocode(query: string, provider?: 'google' | 'kakao' | 'naver'): Promise<GeocodeResult | null> {
  if (provider === 'google') {
    return geocodeGoogle(query);
  } else if (provider === 'kakao') {
    return geocodeKakao(query);
  } else if (provider === 'naver') {
    return geocodeNaver(query);
  } else {
    // 순차적으로 시도
    const kakaoResult = await geocodeKakao(query);
    if (kakaoResult) return kakaoResult;
    
    const googleResult = await geocodeGoogle(query);
    if (googleResult) return googleResult;
    
    return null;
  }
}
