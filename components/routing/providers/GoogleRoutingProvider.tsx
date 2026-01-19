// routing/providers/GoogleRoutingProvider.tsx

import { RouteOptions, Route, RouteStep } from '../../../types';
import { MapProvider } from '../../map-providers/BaseMapProvider';
import { RoutingProvider, RouteDisplay } from '../BaseRoutingProvider';

export class GoogleRoutingProvider implements RoutingProvider {
  private directionsService: google.maps.DirectionsService | null = null;
  private routeDisplays: Map<string, RouteDisplay> = new Map();
  
  getName(): string {
    return 'google';
  }
  
  getSupportedTravelModes(): string[] {
    return ['driving', 'walking', 'transit', 'bicycling'];
  }
  
  getMaxWaypoints(): number {
    return 25; // Google Maps는 최대 25개 경유지 지원
  }
  
  async calculateRoute(options: RouteOptions): Promise<Route[]> {
    if (!window.google || !window.google.maps) {
      throw new Error('Google Maps SDK not loaded');
    }
    
    if (!this.directionsService) {
      this.directionsService = new window.google.maps.DirectionsService();
    }
    
    return new Promise((resolve, reject) => {
      if (!this.directionsService) {
        reject(new Error('DirectionsService not initialized'));
        return;
      }
      
      const waypoints = options.waypoints;
      if (waypoints.length < 2) {
        reject(new Error('At least origin and destination required'));
        return;
      }
      
      const origin = waypoints[0];
      const destination = waypoints[waypoints.length - 1];
      const intermediateWaypoints = waypoints.slice(1, -1);
      
      const request: google.maps.DirectionsRequest = {
        origin: { lat: origin.position.lat, lng: origin.position.lng },
        destination: { lat: destination.position.lat, lng: destination.position.lng },
        waypoints: intermediateWaypoints.map(wp => ({
          location: { lat: wp.position.lat, lng: wp.position.lng },
          stopover: true
        })),
        travelMode: this.convertTravelMode(options.travelMode || 'driving'),
        optimizeWaypoints: options.optimizeWaypoints || false,
        avoidHighways: options.avoidHighways || false,
        avoidTolls: options.avoidTolls || false
      };
      
      this.directionsService.route(request, (result, status) => {
        if (status === window.google.maps.DirectionsStatus.OK && result) {
          const routes: Route[] = result.routes.map((route, index) => {
            const leg = route.legs[0];
            const steps: RouteStep[] = leg.steps.map(step => ({
              instruction: step.instructions || '',
              distance: step.distance?.value || 0,
              duration: step.duration?.value || 0,
              polyline: this.decodePolyline(step.polyline?.points || '')
            }));
            
            return {
              id: `route-${Date.now()}-${index}`,
              distance: leg.distance?.value || 0,
              duration: leg.duration?.value || 0,
              polyline: this.decodePolyline(route.overview_polyline?.points || ''),
              steps
            };
          });
          resolve(routes);
        } else {
          reject(new Error(`Directions request failed: ${status}`));
        }
      });
    });
  }
  
  displayRoute(route: Route, mapProvider: MapProvider): RouteDisplay {
    const mapInstance = mapProvider.getMapInstance();
    if (!mapInstance) {
      throw new Error('Map instance not available');
    }
    
    const polyline = new window.google.maps.Polyline({
      path: route.polyline.map(p => ({ lat: p.lat, lng: p.lng })),
      geodesic: true,
      strokeColor: '#4285F4',
      strokeOpacity: 1.0,
      strokeWeight: 5,
      map: mapInstance,
      zIndex: 1000
    });
    
    const display: RouteDisplay = {
      id: route.id,
      route,
      remove: () => {
        polyline.setMap(null);
        this.routeDisplays.delete(route.id);
      },
      highlight: () => {
        polyline.setOptions({
          strokeColor: '#EA4335',
          strokeWeight: 7
        });
      },
      unhighlight: () => {
        polyline.setOptions({
          strokeColor: '#4285F4',
          strokeWeight: 5
        });
      }
    };
    
    this.routeDisplays.set(route.id, display);
    return display;
  }
  
  removeRoute(routeDisplay: RouteDisplay): void {
    routeDisplay.remove();
  }
  
  private convertTravelMode(mode: string): google.maps.TravelMode {
    switch (mode) {
      case 'driving':
        return window.google.maps.TravelMode.DRIVING;
      case 'walking':
        return window.google.maps.TravelMode.WALKING;
      case 'transit':
        return window.google.maps.TravelMode.TRANSIT;
      case 'bicycling':
        return window.google.maps.TravelMode.BICYCLING;
      default:
        return window.google.maps.TravelMode.DRIVING;
    }
  }
  
  private decodePolyline(encoded: string): Array<{ lat: number; lng: number }> {
    const polyline: Array<{ lat: number; lng: number }> = [];
    let index = 0;
    const len = encoded.length;
    let lat = 0;
    let lng = 0;
    
    while (index < len) {
      let b;
      let shift = 0;
      let result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlat = ((result & 1) !== 0) ? ~(result >> 1) : (result >> 1);
      lat += dlat;
      
      shift = 0;
      result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlng = ((result & 1) !== 0) ? ~(result >> 1) : (result >> 1);
      lng += dlng;
      
      polyline.push({ lat: lat * 1e-5, lng: lng * 1e-5 });
    }
    
    return polyline;
  }
}
