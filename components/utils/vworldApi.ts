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
    return new Promise((resolve, reject) => {
      // VWorld API 데이터셋 선택
      let dataSet = '';
      switch (level) {
        case 'sido':
          dataSet = 'LT_C_ADSIDO_INFO'; // 시도
          break;
        case 'sigungu':
          dataSet = 'LT_C_ADSIGG_INFO'; // 시군구
          break;
        case 'emd':
          dataSet = 'LT_C_ADEMD_INFO'; // 읍면동
          break;
        default:
          reject(new Error(`Unsupported level: ${level}`));
          return;
      }

      const callbackName = `vworld_boundary_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      
      let url = `https://api.vworld.kr/req/data?service=data&request=GetFeature&data=${dataSet}&key=${VWORLD_KEY}&domain=${encodeURIComponent(ALLOWED_DOMAIN)}&crs=EPSG:4326&format=json&errorFormat=json&geometry=true&size=1000`;
      
      // 경계가 지정된 경우 필터 추가
      if (bounds) {
        const bbox = `${bounds.minLng},${bounds.minLat},${bounds.maxLng},${bounds.maxLat}`;
        url += `&bbox=${bbox}`;
      }

      (window as any)[callbackName] = (data: any) => {
        delete (window as any)[callbackName];
        document.getElementById(callbackName)?.remove();

        try {
          if (data.response && data.response.status === 'OK' && data.response.result) {
            const features = data.response.result.featureCollection?.features || [];
            const boundaries: AdministrativeBoundary[] = features.map((feature: any, index: number) => {
              const props = feature.properties || {};
              return {
                id: props.ctp_kor_nm || props.sig_kor_nm || props.emd_kor_nm || `boundary-${index}`,
                name: props.ctp_kor_nm || props.sig_kor_nm || props.emd_kor_nm || 'Unknown',
                level,
                geometry: feature.geometry || { type: 'Polygon', coordinates: [] }
              };
            });
            resolve(boundaries);
          } else {
            console.warn('VWorld API: No features found', data.response);
            resolve([]);
          }
        } catch (error) {
          console.error('VWorld API: Parse error', error);
          reject(error);
        }
      };

      const script = document.createElement('script');
      script.id = callbackName;
      script.src = `${url}&callback=${callbackName}`;
      script.onerror = () => {
        console.error('VWorld API: Script load error');
        delete (window as any)[callbackName];
        document.getElementById(callbackName)?.remove();
        reject(new Error('Script load failed'));
      };
      document.body.appendChild(script);
    });
  }
}
