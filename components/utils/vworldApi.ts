// utils/vworldApi.ts

const VWORLD_KEY = '04FADF88-BBB0-3A72-8404-479547569E44';
const ALLOWED_DOMAIN = 'https://cadapol.vercel.app/';

export interface AdministrativeBoundary {
  id: string;
  name: string;
  level: 'sido' | 'sigungu' | 'emd';
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][];
  };
}

/**
 * VWorld API를 사용하여 행정경계 데이터 조회
 */
export class VWorldAPI {
  /**
   * 행정경계 데이터 조회
   * @param level 행정경계 레벨 ('sido', 'sigungu', 'emd')
   * @param bounds 지도 경계 (선택사항, 없으면 전체 조회)
   */
  static async getAdministrativeBoundaries(
    level: 'sido' | 'sigungu' | 'emd',
    bounds?: { minLat: number; minLng: number; maxLat: number; maxLng: number }
  ): Promise<AdministrativeBoundary[]> {
    // ✅ Vercel 서버리스 함수를 통한 프록시 사용 (CORS 우회)
    // ⚠️ 행정경계 데이터셋은 JSONP를 지원하지 않으므로 프록시만 사용
    try {
      return await this.getAdministrativeBoundariesViaProxy(level, bounds);
    } catch (error) {
      console.error('VWorld API: Proxy failed', error);
      // ❌ JSONP 폴백 제거: 행정경계 데이터셋은 JSONP를 지원하지 않음
      throw new Error(`Failed to load administrative boundaries via proxy: ${(error as Error).message}`);
    }
  }
  
  /**
   * Vercel 서버리스 함수를 통한 행정경계 데이터 조회
   * ⚠️ 행정경계 데이터셋은 JSONP를 지원하지 않으므로 프록시만 사용
   */
  private static async getAdministrativeBoundariesViaProxy(
    level: 'sido' | 'sigungu' | 'emd',
    bounds?: { minLat: number; minLng: number; maxLat: number; maxLng: number }
  ): Promise<AdministrativeBoundary[]> {
    // ✅ 환경 감지 제거: 프록시를 항상 시도 (로컬에서도 Vercel CLI로 테스트 가능)
    let url = `/api/vworld-boundaries?level=${level}`;
    
    if (bounds) {
      const bbox = `${bounds.minLng},${bounds.minLat},${bounds.maxLng},${bounds.maxLat}`;
      url += `&bbox=${encodeURIComponent(bbox)}`;
    }
    
    try {
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Proxy error details:', {
          status: response.status,
          statusText: response.statusText,
          url,
          error: errorData
        });
        throw new Error(`Proxy error: ${response.status} - ${errorData.error || 'Unknown error'}`);
      }
      
        const data = await response.json();
      
      // 응답 검증
      if (!data || !data.response) {
        console.error('Invalid API response format:', data);
        throw new Error('Invalid API response format');
      }
      
      if (data.response.status !== 'OK') {
        console.error('VWorld API error:', data.response);
        throw new Error(`API error: ${data.response.status}`);
      }
      
      if (!data.response.result || !data.response.result.featureCollection) {
        console.warn('VWorld API: No feature collection in response', data.response);
        return [];
      }
      
      const features = data.response.result.featureCollection.features || [];
      
      if (features.length === 0) {
        console.warn('VWorld API: No features found for the specified bounds');
        return [];
      }
      
      const boundaries: AdministrativeBoundary[] = features.map((feature: any, index: number) => {
        const props = feature.properties || {};
        return {
          id: props.ctp_kor_nm || props.sig_kor_nm || props.emd_kor_nm || `boundary-${index}`,
          name: props.ctp_kor_nm || props.sig_kor_nm || props.emd_kor_nm || 'Unknown',
          level,
          geometry: feature.geometry || { type: 'Polygon', coordinates: [] }
        };
      });
      
      console.log(`VWorld API: Loaded ${boundaries.length} boundaries via proxy`);
      return boundaries;
    } catch (error) {
      console.error('Proxy fetch failed:', error);
      console.error('Request URL:', url);
      throw error;
    }
  }
  
  /**
   * JSONP 방식으로 행정경계 데이터 조회 (fallback)
   */
  private static async getAdministrativeBoundariesJSONP(
    level: 'sido' | 'sigungu' | 'emd',
    bounds?: { minLat: number; minLng: number; maxLat: number; maxLng: number }
  ): Promise<AdministrativeBoundary[]> {
    return new Promise((resolve, reject) => {
      // VWorld API 데이터셋 선택
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
        default:
          reject(new Error(`Unsupported level: ${level}`));
          return;
      }

      // 기존 지적 기능과 동일한 콜백 함수 이름 형식 사용
      const callbackName = `vworld_boundary_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      
      const domain = ALLOWED_DOMAIN || 'https://cadapol.vercel.app/';
      let url = `https://api.vworld.kr/req/data?service=data&version=2.0&request=GetFeature&data=${dataSet}&key=${VWORLD_KEY}&domain=${encodeURIComponent(domain)}&crs=EPSG:4326&format=json&errorFormat=json&geometry=true`;
      
      if (bounds) {
        const bbox = `${bounds.minLng},${bounds.minLat},${bounds.maxLng},${bounds.maxLat}`;
        url += `&bbox=${bbox}`;
      }
      
      // ✅ 타임아웃 설정 (30초)
      const timeoutId = setTimeout(() => {
        console.error('VWorld API: JSONP request timeout');
        delete (window as any)[callbackName];
        const scriptElement = document.getElementById(callbackName);
        if (scriptElement) {
          scriptElement.remove();
        }
        reject(new Error('JSONP request timeout'));
      }, 30000);

      // 콜백 함수를 window 객체에 할당
      (window as any)[callbackName] = (data: any) => {
        // ✅ 타임아웃 클리어
        clearTimeout(timeoutId);
        
        // ✅ 콜백 실행 후 즉시 정리
        delete (window as any)[callbackName];
        const scriptElement = document.getElementById(callbackName);
        if (scriptElement) {
          scriptElement.remove();
        }

        try {
          // ✅ 응답이 문자열인 경우 (JSONP가 작동하지 않음)
          if (typeof data === 'string') {
            console.error('VWorld API: Received string response instead of JSONP - API may not support JSONP', data.substring(0, 200));
            reject(new Error('VWorld API does not support JSONP for administrative boundaries. Response: ' + data.substring(0, 100)));
            return;
          }
          
          // ✅ 응답 검증 (기존 지적 기능과 동일한 패턴)
          if (data && data.response && data.response.status === 'OK' && data.response.result) {
            const featureCollection = data.response.result.featureCollection;
            if (featureCollection && featureCollection.features && featureCollection.features.length > 0) {
              const features = featureCollection.features;
              const boundaries: AdministrativeBoundary[] = features.map((feature: any, index: number) => {
                const props = feature.properties || {};
                return {
                  id: props.ctp_kor_nm || props.sig_kor_nm || props.emd_kor_nm || `boundary-${index}`,
                  name: props.ctp_kor_nm || props.sig_kor_nm || props.emd_kor_nm || 'Unknown',
                  level,
                  geometry: feature.geometry || { type: 'Polygon', coordinates: [] }
                };
              });
              console.log(`VWorld API: Loaded ${boundaries.length} boundaries via JSONP`);
              resolve(boundaries);
            } else {
              console.warn('VWorld API: No features found in response', data.response);
              resolve([]);
            }
          } else if (data && data.response) {
            // ✅ API 에러 응답 처리
            console.error('VWorld API: API error response', data.response);
            if (data.response.status === 'ERROR') {
              reject(new Error(`VWorld API error: ${data.response.status?.text || 'Unknown error'}`));
            } else {
              console.warn('VWorld API: API error or invalid response', data.response);
              resolve([]);
            }
          } else {
            console.warn('VWorld API: Invalid response format', data);
            reject(new Error('Invalid API response format'));
          }
        } catch (error) {
          console.error('VWorld API: Error processing JSONP response', error, data);
          reject(new Error('Failed to process API response: ' + (error as Error).message));
        }
      };

      const script = document.createElement('script');
      script.id = callbackName;
      script.src = `${url}&callback=${callbackName}`;
      
      // ✅ 스크립트 로드 완료 후 응답 확인 (JSONP가 작동하지 않는 경우 감지)
      script.onload = () => {
        // 스크립트가 로드되었지만 콜백이 호출되지 않은 경우 (일정 시간 후 확인)
        setTimeout(() => {
          if ((window as any)[callbackName]) {
            console.error('VWorld API: JSONP callback was not called - API may not support JSONP');
            clearTimeout(timeoutId);
            delete (window as any)[callbackName];
            const scriptElement = document.getElementById(callbackName);
            if (scriptElement) {
              scriptElement.remove();
            }
            reject(new Error('VWorld API does not support JSONP for this dataset. Please check API documentation.'));
          }
        }, 1000);
      };
      
      script.onerror = () => {
        clearTimeout(timeoutId);
        console.error('VWorld API: Script load error - JSONP may not be supported');
        delete (window as any)[callbackName];
        const scriptElement = document.getElementById(callbackName);
        if (scriptElement) {
          scriptElement.remove();
        }
        reject(new Error('Script load failed - VWorld API may not support JSONP for administrative boundaries'));
      };
      
      document.body.appendChild(script);
    });
  }
}
