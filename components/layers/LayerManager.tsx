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

  setMapProvider(provider: MapProvider | null): void {
    this.mapProvider = provider;
    // 맵 제공자 변경 시 모든 레이어 재연결
    this.layers.forEach(layer => {
      if (provider) {
        layer.attachToMap(provider);
      } else {
        layer.detachFromMap();
      }
    });
  }

  addLayer(config: LayerConfig): void {
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
    
    if (this.mapProvider) {
      layer.attachToMap(this.mapProvider);
    }
    
    this.layers.set(config.id, layer);
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
