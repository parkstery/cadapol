// layers/LayerManager.tsx

import React, { useState, useCallback, useEffect } from 'react';
import { LayerConfig, LayerType } from '../../types';
import { Layer, MapProvider } from '../map-providers/BaseMapProvider';
import { AdministrativeBoundaryLayer } from './AdministrativeBoundaryLayer';
import { createDefaultLayerConfig } from './BaseLayer';

interface LayerManagerProps {
  mapProvider: MapProvider | null;
}

export class LayerManager {
  private layers: Map<string, Layer> = new Map();
  private mapProvider: MapProvider | null = null;

  async setMapProvider(provider: MapProvider | null): Promise<void> {
    this.mapProvider = provider;
    // 맵 제공자 변경 시 모든 레이어 재연결
    const attachPromises = Array.from(this.layers.values()).map(layer => {
      if (provider) {
        return layer.attachToMap(provider).catch(error => {
          console.error(`Failed to attach layer ${layer.getId()} to map:`, error);
        });
      } else {
        layer.detachFromMap();
        return Promise.resolve();
      }
    });
    await Promise.all(attachPromises);
  }

  async addLayer(config: LayerConfig): Promise<void> {
    if (this.layers.has(config.id)) {
      console.warn(`Layer with id ${config.id} already exists`);
      return;
    }

    let layer: Layer;
    
    switch (config.type) {
      case LayerType.ADMINISTRATIVE_BOUNDARY:
        layer = new AdministrativeBoundaryLayer(config);
        break;
      default:
        throw new Error(`Unsupported layer type: ${config.type}`);
    }
    
    // ✅ 비동기 처리 추가
    try {
      if (this.mapProvider) {
        await layer.attachToMap(this.mapProvider);
      }
      this.layers.set(config.id, layer);
    } catch (error) {
      console.error(`Failed to add layer ${config.id}:`, error);
      throw error; // 에러 전파
    }
  }

  removeLayer(layerId: string): void {
    const layer = this.layers.get(layerId);
    if (layer) {
      layer.detachFromMap();
      layer.cleanup();
      this.layers.delete(layerId);
    }
  }

  getLayer(layerId: string): Layer | undefined {
    return this.layers.get(layerId);
  }

  getAllLayers(): Layer[] {
    return Array.from(this.layers.values());
  }

  toggleLayer(layerId: string): void {
    const layer = this.layers.get(layerId);
    if (layer) {
      if (layer.isVisible()) {
        layer.hide();
      } else {
        layer.show();
      }
    }
  }

  updateLayerOpacity(layerId: string, opacity: number): void {
    const layer = this.layers.get(layerId);
    if (layer) {
      layer.setOpacity(opacity);
    }
  }

  updateLayerZIndex(layerId: string, zIndex: number): void {
    const layer = this.layers.get(layerId);
    if (layer) {
      layer.setZIndex(zIndex);
    }
  }

  cleanup(): void {
    this.layers.forEach(layer => {
      layer.detachFromMap();
      layer.cleanup();
    });
    this.layers.clear();
    this.mapProvider = null;
  }
}
