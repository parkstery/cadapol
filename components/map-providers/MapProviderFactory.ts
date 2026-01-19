// map-providers/MapProviderFactory.ts

import { MapVendor } from '../../types';
import { MapProvider } from './BaseMapProvider';
import { GoogleMapProvider } from './GoogleMapProvider';
import { KakaoMapProvider } from './KakaoMapProvider';
import { NaverMapProvider } from './NaverMapProvider';

/**
 * 맵 제공자 팩토리
 * 맵 제공자 인스턴스를 생성하고 관리합니다.
 */
export class MapProviderFactory {
  /**
   * 맵 제공자 인스턴스 생성
   * @param vendor 맵 제공자 타입
   * @returns 맵 제공자 인스턴스
   */
  static create(vendor: MapVendor): MapProvider {
    switch (vendor) {
      case 'google':
        return new GoogleMapProvider();
      case 'kakao':
        return new KakaoMapProvider();
      case 'naver':
        return new NaverMapProvider();
      case 'vworld':
        // TODO: Phase 5에서 구현
        throw new Error('VWorldMapProvider not yet implemented');
      case 'osm':
        // TODO: Phase 5에서 구현
        throw new Error('OSMMapProvider not yet implemented');
      default:
        throw new Error(`Unsupported map vendor: ${vendor}`);
    }
  }
  
  /**
   * 지원되는 맵 제공자 목록 반환
   * @returns 지원되는 맵 제공자 배열
   */
  static getSupportedVendors(): MapVendor[] {
    return ['google', 'kakao', 'naver', 'vworld', 'osm'];
  }
  
  /**
   * 맵 제공자가 지원되는지 확인
   * @param vendor 맵 제공자 타입
   * @returns 지원 여부
   */
  static isSupported(vendor: string): vendor is MapVendor {
    return this.getSupportedVendors().includes(vendor as MapVendor);
  }
}
