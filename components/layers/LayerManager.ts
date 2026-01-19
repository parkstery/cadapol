// layers/LayerManager.ts

import { Layer } from '../map-providers/BaseMapProvider';
import { LayerType, LayerConfig } from '../../types';
import { LAYER_Z_INDEX } from '../utils/constants';

/**
 * 레이어 관리자
 * 여러 레이어를 추가/제거/토글하고 순서를 관리합니다.
 */
export class LayerManager {
  private layers: Map<string, Layer> = new Map();
  private layerConfigs: Map<string, LayerConfig> = new Map();
  private mapProvider: any = null;

  /**
   * 맵 제공자 설정
   */
  setMapProvider(provider: any): void {
    this.mapProvider = provider;
    // 기존 레이어들을 새 제공자에 연결
    this.layers.forEach((layer) => {
      try {
        layer.attachToMap(provider);
      } catch (error) {
        console.error('Failed to attach layer to new provider:', error);
      }
    });
  }

  /**
   * 레이어 추가
   */
  addLayer(layer: Layer, config: LayerConfig): void {
    const id = config.id;
    
    // 기존 레이어가 있으면 제거
    if (this.layers.has(id)) {
      this.removeLayer(id);
    }

    // 레이어 설정 저장
    this.layerConfigs.set(id, config);
    this.layers.set(id, layer);

    // 맵 제공자에 연결
    if (this.mapProvider) {
      try {
        layer.attachToMap(this.mapProvider);
      } catch (error) {
        console.error('Failed to attach layer to map provider:', error);
      }
    }

    // Z-index 설정
    layer.setZIndex(config.zIndex || this.getDefaultZIndex(config.type));
    
    // 투명도 설정
    layer.setOpacity(config.opacity);

    // 표시 여부 설정
    if (config.visible) {
      layer.show();
    } else {
      layer.hide();
    }
  }

  /**
   * 레이어 제거
   */
  removeLayer(id: string): boolean {
    const layer = this.layers.get(id);
    if (layer) {
      try {
        layer.cleanup();
      } catch (error) {
        console.error('Failed to cleanup layer:', error);
      }
      this.layers.delete(id);
      this.layerConfigs.delete(id);
      return true;
    }
    return false;
  }

  /**
   * 레이어 가져오기
   */
  getLayer(id: string): Layer | null {
    return this.layers.get(id) || null;
  }

  /**
   * 레이어 설정 가져오기
   */
  getLayerConfig(id: string): LayerConfig | null {
    return this.layerConfigs.get(id) || null;
  }

  /**
   * 모든 레이어 가져오기
   */
  getAllLayers(): Layer[] {
    return Array.from(this.layers.values());
  }

  /**
   * 모든 레이어 설정 가져오기
   */
  getAllLayerConfigs(): LayerConfig[] {
    return Array.from(this.layerConfigs.values());
  }

  /**
   * 타입별 레이어 가져오기
   */
  getLayersByType(type: LayerType): Layer[] {
    return Array.from(this.layers.values()).filter(
      (layer) => layer.getType() === type
    );
  }

  /**
   * 레이어 표시/숨김 토글
   */
  toggleLayer(id: string): boolean {
    const layer = this.layers.get(id);
    const config = this.layerConfigs.get(id);
    
    if (!layer || !config) {
      return false;
    }

    const newVisible = !config.visible;
    config.visible = newVisible;

    if (newVisible) {
      layer.show();
    } else {
      layer.hide();
    }

    return newVisible;
  }

  /**
   * 레이어 표시 설정
   */
  setLayerVisible(id: string, visible: boolean): void {
    const layer = this.layers.get(id);
    const config = this.layerConfigs.get(id);
    
    if (!layer || !config) {
      return;
    }

    config.visible = visible;

    if (visible) {
      layer.show();
    } else {
      layer.hide();
    }
  }

  /**
   * 레이어 투명도 설정
   */
  setLayerOpacity(id: string, opacity: number): void {
    const layer = this.layers.get(id);
    const config = this.layerConfigs.get(id);
    
    if (!layer || !config) {
      return;
    }

    const clampedOpacity = Math.max(0, Math.min(1, opacity));
    config.opacity = clampedOpacity;
    layer.setOpacity(clampedOpacity);
  }

  /**
   * 레이어 Z-index 설정
   */
  setLayerZIndex(id: string, zIndex: number): void {
    const layer = this.layers.get(id);
    const config = this.layerConfigs.get(id);
    
    if (!layer || !config) {
      return;
    }

    config.zIndex = zIndex;
    layer.setZIndex(zIndex);
  }

  /**
   * 레이어 순서 변경 (Z-index 재조정)
   */
  reorderLayers(ids: string[]): void {
    ids.forEach((id, index) => {
      const config = this.layerConfigs.get(id);
      if (config) {
        const newZIndex = LAYER_Z_INDEX.BASE + (index + 1) * 10;
        this.setLayerZIndex(id, newZIndex);
      }
    });
  }

  /**
   * 모든 레이어 제거
   */
  clearAll(): void {
    this.layers.forEach((layer) => {
      try {
        layer.cleanup();
      } catch (error) {
        console.error('Failed to cleanup layer:', error);
      }
    });
    this.layers.clear();
    this.layerConfigs.clear();
  }

  /**
   * 타입별 기본 Z-index 가져오기
   */
  private getDefaultZIndex(type: LayerType): number {
    switch (type) {
      case LayerType.CADASTRAL:
        return LAYER_Z_INDEX.CADASTRAL;
      case LayerType.ADMINISTRATIVE_BOUNDARY:
        return LAYER_Z_INDEX.ADMINISTRATIVE_BOUNDARY;
      case LayerType.TOPOGRAPHIC:
        return LAYER_Z_INDEX.TOPOGRAPHIC;
      case LayerType.CUSTOM:
        return LAYER_Z_INDEX.CUSTOM;
      default:
        return LAYER_Z_INDEX.BASE;
    }
  }

  /**
   * 리소스 정리
   */
  cleanup(): void {
    this.clearAll();
    this.mapProvider = null;
  }
}
