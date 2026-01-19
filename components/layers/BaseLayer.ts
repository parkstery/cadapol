// layers/BaseLayer.ts

// BaseLayer 인터페이스는 BaseMapProvider.ts에 정의되어 있습니다.
// 이 파일은 레이어 관련 유틸리티 함수를 제공합니다.

import { LayerType, LayerConfig } from '../../types';
import { Layer } from '../map-providers/BaseMapProvider';

/**
 * 레이어 ID 생성 헬퍼
 */
export function generateLayerId(type: LayerType, index?: number): string {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return `${type}-${timestamp}-${random}${index !== undefined ? `-${index}` : ''}`;
}

/**
 * 레이어 설정 검증
 */
export function validateLayerConfig(config: LayerConfig): boolean {
  if (!config.id || !config.type || !config.name) {
    return false;
  }
  
  if (config.opacity < 0 || config.opacity > 1) {
    return false;
  }
  
  return true;
}

/**
 * 레이어 기본 설정 생성
 */
export function createDefaultLayerConfig(
  type: LayerType,
  name: string,
  options?: Partial<LayerConfig>
): LayerConfig {
  return {
    id: options?.id || generateLayerId(type),
    type,
    name,
    visible: options?.visible ?? true,
    opacity: options?.opacity ?? 1.0,
    zIndex: options?.zIndex ?? 10,
    provider: options?.provider,
    options: options?.options,
  };
}
