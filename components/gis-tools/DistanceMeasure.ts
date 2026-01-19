// gis-tools/DistanceMeasure.ts

/**
 * 거리 측정 도구
 * 카카오맵에서 거리 측정 기능을 제공합니다.
 */

export interface DistanceMeasureConfig {
  map: any; // kakao.maps.Map
  onDistanceCalculated?: (distance: number) => void;
}

export class DistanceMeasure {
  private map: any;
  private currentLine: any = null;
  private floatingLine: any = null;
  private floatingOverlay: any = null;
  private fixedOverlays: any[] = [];
  private listeners: Array<() => void> = [];
  private isButtonClick: boolean = false;
  private onDistanceCalculated?: (distance: number) => void;

  constructor(config: DistanceMeasureConfig) {
    this.map = config.map;
    this.onDistanceCalculated = config.onDistanceCalculated;
  }

  /**
   * 거리 측정 시작
   */
  start(): void {
    if (!this.map) return;
    
    this.map.setCursor('crosshair');
    this.setupListeners();
  }

  /**
   * 거리 측정 중지 및 정리
   */
  stop(): void {
    this.cleanup();
    if (this.map) {
      this.map.setCursor('default');
    }
  }

  /**
   * 리소스 정리
   */
  private cleanup(): void {
    // 리스너 제거
    this.listeners.forEach(fn => fn());
    this.listeners = [];

    // 오버레이 제거
    if (this.currentLine) {
      this.currentLine.setMap(null);
      this.currentLine = null;
    }
    if (this.floatingLine) {
      this.floatingLine.setMap(null);
      this.floatingLine = null;
    }
    if (this.floatingOverlay) {
      this.floatingOverlay.setMap(null);
      this.floatingOverlay = null;
    }
    this.fixedOverlays.forEach(o => o.setMap(null));
    this.fixedOverlays = [];
  }

  /**
   * 거리 계산 (Haversine formula)
   */
  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000; // 지구 반지름 (미터)
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * 플로우팅 거리 업데이트
   */
  private updateFloatingDistance(mousePos: any): void {
    if (!this.currentLine) return;
    
    const path = this.currentLine.getPath();
    if (path.length === 0) return;
    
    const lastPoint = path[path.length - 1];
    const distance = Math.round(this.calculateDistance(
      lastPoint.getLat(), lastPoint.getLng(),
      mousePos.getLat(), mousePos.getLng()
    ));
    
    // 플로우팅 선 업데이트
    if (this.floatingLine) {
      this.floatingLine.setPath([lastPoint, mousePos]);
    } else {
      this.floatingLine = new window.kakao.maps.Polyline({
        map: this.map,
        path: [lastPoint, mousePos],
        strokeWeight: 3,
        strokeColor: '#FF3333',
        strokeOpacity: 0.6,
        strokeStyle: 'solid',
        zIndex: 9
      });
    }
    
    // 플로우팅 오버레이 업데이트
    if (this.floatingOverlay) {
      this.floatingOverlay.setPosition(mousePos);
      const content = this.floatingOverlay.getContent();
      if (content) {
        content.innerHTML = `<div class="measure-label" style="background:rgba(255,255,255,0.9); border:1px solid #333; padding:2.8px 4.2px; border-radius:4px; font-size:8.4px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">${distance}m</div>`;
      }
    } else {
      const content = document.createElement('div');
      content.innerHTML = `<div class="measure-label" style="background:rgba(255,255,255,0.9); border:1px solid #333; padding:2.8px 4.2px; border-radius:4px; font-size:8.4px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">${distance}m</div>`;
      this.floatingOverlay = new window.kakao.maps.CustomOverlay({
        map: this.map,
        position: mousePos,
        content: content,
        yAnchor: 2,
        zIndex: 100
      });
    }
  }

  /**
   * 이벤트 리스너 설정
   */
  private setupListeners(): void {
    const handleClick = (e: any) => {
      if (this.isButtonClick) {
        this.isButtonClick = false;
        return;
      }
      
      const pos = e.latLng;
      
      // 플로우팅 선 제거
      if (this.floatingLine) {
        this.floatingLine.setMap(null);
        this.floatingLine = null;
      }
      
      if (!this.currentLine) {
        // 첫 번째 포인트
        this.currentLine = new window.kakao.maps.Polyline({
          map: this.map,
          path: [pos],
          strokeWeight: 3,
          strokeColor: '#FF3333',
          strokeOpacity: 1,
          strokeStyle: 'solid',
          zIndex: 10
        });
      } else {
        // 두 번째 포인트 이후
        const path = this.currentLine.getPath();
        path.push(pos);
        this.currentLine.setPath(path);
        
        // 고정 거리 표시
        const segmentLength = path.length >= 2 
          ? Math.round(this.calculateDistance(
              path[path.length - 2].getLat(), path[path.length - 2].getLng(),
              path[path.length - 1].getLat(), path[path.length - 1].getLng()
            ))
          : 0;
        
        const content = document.createElement('div');
        content.innerHTML = `<div class="measure-label" style="background:white; border:1px solid #333; padding:2.8px 4.2px; border-radius:4px; font-size:8.4px;">${segmentLength}m</div>`;
        const fixedOverlay = new window.kakao.maps.CustomOverlay({
          map: this.map,
          position: pos,
          content: content,
          yAnchor: 2,
          zIndex: 50
        });
        this.fixedOverlays.push(fixedOverlay);
      }
    };

    const handleMouseMove = (e: any) => {
      if (this.currentLine) {
        this.updateFloatingDistance(e.latLng);
      }
    };

    const handleRightClick = (e: any) => {
      if (this.currentLine) {
        const path = this.currentLine.getPath();
        if (path.length < 2) {
          this.map.setCursor('default');
          this.currentLine.setMap(null);
          this.currentLine = null;
          if (this.floatingLine) {
            this.floatingLine.setMap(null);
            this.floatingLine = null;
          }
          return;
        }
        
        const totalLength = Math.round(this.currentLine.getLength());
        const lastPos = path[path.length - 1];
        
        // 플로우팅 선 및 오버레이 제거
        if (this.floatingLine) {
          this.floatingLine.setMap(null);
          this.floatingLine = null;
        }
        if (this.floatingOverlay) {
          this.floatingOverlay.setMap(null);
          this.floatingOverlay = null;
        }
        
        // 총 거리 표시 및 UI 생성
        this.showTotalDistance(totalLength, lastPos);
        
        // 콜백 호출
        if (this.onDistanceCalculated) {
          this.onDistanceCalculated(totalLength);
        }
        
        this.map.setCursor('default');
        this.currentLine = null;
        this.fixedOverlays = [];
      }
    };

    window.kakao.maps.event.addListener(this.map, 'click', handleClick);
    window.kakao.maps.event.addListener(this.map, 'mousemove', handleMouseMove);
    window.kakao.maps.event.addListener(this.map, 'rightclick', handleRightClick);
    
    this.listeners.push(
      () => window.kakao.maps.event.removeListener(this.map, 'click', handleClick),
      () => window.kakao.maps.event.removeListener(this.map, 'mousemove', handleMouseMove),
      () => window.kakao.maps.event.removeListener(this.map, 'rightclick', handleRightClick)
    );
  }

  /**
   * 총 거리 표시 UI 생성
   */
  private showTotalDistance(totalLength: number, lastPos: any): void {
    // 텍스트 닫기 버튼
    const textCloseBtn = document.createElement('button');
    textCloseBtn.innerHTML = '✕';
    textCloseBtn.style.cssText = 'position:absolute; top:-8px; right:-8px; width:20px; height:20px; border-radius:50%; background:#999; color:white; border:none; cursor:pointer; font-size:12px; line-height:1; box-shadow:0 2px 4px rgba(0,0,0,0.3); pointer-events: auto; z-index: 1000;';
    textCloseBtn.title = '텍스트 박스 닫기';
    
    const content = document.createElement('div');
    content.style.position = 'relative';
    content.style.pointerEvents = 'none';
    content.innerHTML = `<div class="measure-label" style="background:white; border:2px solid #FF3333; padding:4.2px 5.6px; border-radius:4px; font-size:9.8px; font-weight:bold; color:#FF3333; pointer-events: none;">총 거리: ${totalLength}m</div>`;
    content.appendChild(textCloseBtn);
    
    // 이벤트 전파 방지
    content.addEventListener('mousedown', (e: any) => e.stopPropagation());
    content.addEventListener('mouseup', (e: any) => e.stopPropagation());
    content.addEventListener('click', (e: any) => e.stopPropagation());
    
    const totalOverlay = new window.kakao.maps.CustomOverlay({
      map: this.map,
      position: lastPos,
      content: content,
      yAnchor: 2,
      zIndex: 100
    });
    this.fixedOverlays.push(totalOverlay);
    
    // 삭제 버튼
    const deleteBtn = document.createElement('button');
    deleteBtn.innerHTML = '✕';
    deleteBtn.style.cssText = 'width:20px; height:20px; border-radius:50%; background:#999; color:white; border:none; cursor:pointer; font-size:12px; line-height:1; box-shadow:0 2px 4px rgba(0,0,0,0.3); pointer-events: auto; z-index: 1000; display: flex; align-items: center; justify-content: center;';
    deleteBtn.title = '측정 객체 삭제';
    
    const deleteBtnPos = new window.kakao.maps.LatLng(
      lastPos.getLat() + 0.00001,
      lastPos.getLng()
    );
    
    const deleteBtnContainer = document.createElement('div');
    deleteBtnContainer.style.pointerEvents = 'none';
    deleteBtnContainer.appendChild(deleteBtn);
    
    const deleteBtnOverlay = new window.kakao.maps.CustomOverlay({
      map: this.map,
      position: deleteBtnPos,
      content: deleteBtnContainer,
      yAnchor: 0.5,
      xAnchor: 0.5,
      zIndex: 101
    });
    this.fixedOverlays.push(deleteBtnOverlay);
    
    // 버튼 이벤트 핸들러
    const savedCurrentLine = this.currentLine;
    const savedFixedOverlays = [...this.fixedOverlays];
    
    const handleTextCloseBtnClick = (e: any) => {
      e.stopPropagation();
      e.preventDefault();
      this.isButtonClick = true;
      
      savedFixedOverlays.forEach(o => {
        o.setMap(null);
      });
    };
    
    const handleDeleteBtnClick = (e: any) => {
      e.stopPropagation();
      e.preventDefault();
      this.isButtonClick = true;
      
      if (savedCurrentLine) {
        savedCurrentLine.setMap(null);
      }
      savedFixedOverlays.forEach(o => {
        o.setMap(null);
      });
    };
    
    textCloseBtn.addEventListener('mousedown', (e: any) => { e.stopPropagation(); e.preventDefault(); }, true);
    textCloseBtn.addEventListener('mouseup', (e: any) => { e.stopPropagation(); e.preventDefault(); }, true);
    textCloseBtn.addEventListener('click', handleTextCloseBtnClick, true);
    
    deleteBtn.addEventListener('mousedown', (e: any) => { e.stopPropagation(); e.preventDefault(); }, true);
    deleteBtn.addEventListener('mouseup', (e: any) => { e.stopPropagation(); e.preventDefault(); }, true);
    deleteBtn.addEventListener('click', handleDeleteBtnClick, true);
  }
}
