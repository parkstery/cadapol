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
    // ✅ VWorld API는 CORS를 지원하지 않으므로 처음부터 JSONP만 사용
    return this.getAdministrativeBoundariesJSONP(level, bounds);
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
      let url = `https://api.vworld.kr/req/data?service=data&request=GetFeature&data=${dataSet}&key=${VWORLD_KEY}&domain=${encodeURIComponent(domain)}&crs=EPSG:4326&format=json&errorFormat=json&geometry=true`;
      
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
          } else {
            console.warn('VWorld API: API error or invalid response', data?.response);
            resolve([]);
          }
        } catch (error) {
          console.error('VWorld API: Error processing JSONP response', error);
          reject(new Error('Failed to process API response: ' + (error as Error).message));
        }
      };

      const script = document.createElement('script');
      script.id = callbackName;
      script.src = `${url}&callback=${callbackName}`;
      script.onerror = () => {
        clearTimeout(timeoutId);
        console.error('VWorld API: Script load error');
        delete (window as any)[callbackName];
        const scriptElement = document.getElementById(callbackName);
        if (scriptElement) {
          scriptElement.remove();
        }
        reject(new Error('Script load failed'));
      };
      
      document.body.appendChild(script);
    });
  }
}
