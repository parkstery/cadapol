// gis-tools/AreaMeasure.ts

/**
 * 면적 측정 도구
 * 카카오맵에서 면적 측정 기능을 제공합니다.
 */

export interface AreaMeasureConfig {
  map: any; // kakao.maps.Map
  onAreaCalculated?: (area: number) => void;
}

export class AreaMeasure {
  private map: any;
  private currentPoly: any = null;
  private floatingLine: any = null;
  private floatingPoly: any = null;
  private floatingOverlay: any = null;
  private listeners: Array<() => void> = [];
  private isButtonClick: boolean = false;
  private onAreaCalculated?: (area: number) => void;

  constructor(config: AreaMeasureConfig) {
    this.map = config.map;
    this.onAreaCalculated = config.onAreaCalculated;
  }

  /**
   * 면적 측정 시작
   */
  start(): void {
    if (!this.map) return;
    
    this.map.setCursor('crosshair');
    this.setupListeners();
  }

  /**
   * 면적 측정 중지 및 정리
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
    if (this.currentPoly) {
      this.currentPoly.setMap(null);
      this.currentPoly = null;
    }
    if (this.floatingLine) {
      this.floatingLine.setMap(null);
      this.floatingLine = null;
    }
    if (this.floatingPoly) {
      this.floatingPoly.setMap(null);
      this.floatingPoly = null;
    }
    if (this.floatingOverlay) {
      this.floatingOverlay.setMap(null);
      this.floatingOverlay = null;
    }
  }

  /**
   * 플로우팅 면적 업데이트
   */
  private updateFloatingArea(mousePos: any): void {
    if (!this.currentPoly) return;
    
    const path = this.currentPoly.getPath();
    if (path.length < 1) return;
    
    // 첫 번째 포인트 이후부터 플로우팅 선 표시
    if (path.length >= 1) {
      const lastPoint = path[path.length - 1];
      
      // 플로우팅 선 업데이트
      if (this.floatingLine) {
        this.floatingLine.setPath([lastPoint, mousePos]);
      } else {
        this.floatingLine = new window.kakao.maps.Polyline({
          map: this.map,
          path: [lastPoint, mousePos],
          strokeWeight: 3,
          strokeColor: '#39f',
          strokeOpacity: 0.6,
          strokeStyle: 'solid',
          zIndex: 9
        });
      }
    }
    
    // 두 번째 포인트 이후부터 플로우팅 폴리곤 표시
    if (path.length >= 2) {
      const tempPath = [...path, mousePos];
      
      // 플로우팅 폴리곤 업데이트
      if (this.floatingPoly) {
        this.floatingPoly.setPath(tempPath);
      } else {
        this.floatingPoly = new window.kakao.maps.Polygon({
          map: this.map,
          path: tempPath,
          strokeWeight: 3,
          strokeColor: '#39f',
          strokeOpacity: 0.6,
          strokeStyle: 'solid',
          fillColor: '#A2D4EC',
          fillOpacity: 0.25,
          zIndex: 9
        });
      }
      
      // 면적 계산
      const tempPoly = new window.kakao.maps.Polygon({
        path: tempPath,
        strokeWeight: 0,
        fillColor: 'transparent',
        fillOpacity: 0
      });
      const area = Math.round(tempPoly.getArea());
      
      // 플로우팅 오버레이 업데이트
      if (this.floatingOverlay) {
        this.floatingOverlay.setPosition(mousePos);
        this.floatingOverlay.setContent(`<div class="measure-label" style="background:rgba(255,255,255,0.9); border:1px solid #333; padding:2.8px 4.2px; border-radius:4px; font-size:8.4px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">${area}m²</div>`);
      } else {
        const content = document.createElement('div');
        content.innerHTML = `<div class="measure-label" style="background:rgba(255,255,255,0.9); border:1px solid #333; padding:2.8px 4.2px; border-radius:4px; font-size:8.4px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">${area}m²</div>`;
        this.floatingOverlay = new window.kakao.maps.CustomOverlay({
          map: this.map,
          position: mousePos,
          content: content,
          yAnchor: 2,
          zIndex: 100
        });
      }
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
      
      // 플로우팅 선 및 폴리곤 제거
      if (this.floatingLine) {
        this.floatingLine.setMap(null);
        this.floatingLine = null;
      }
      if (this.floatingPoly) {
        this.floatingPoly.setMap(null);
        this.floatingPoly = null;
      }
      
      if (!this.currentPoly) {
        this.currentPoly = new window.kakao.maps.Polygon({
          map: this.map,
          path: [pos],
          strokeWeight: 3,
          strokeColor: '#39f',
          strokeOpacity: 0.8,
          fillColor: '#A2D4EC',
          fillOpacity: 0.5,
          zIndex: 10
        });
      } else {
        const path = this.currentPoly.getPath();
        path.push(pos);
        this.currentPoly.setPath(path);
      }
    };

    const handleMouseMove = (e: any) => {
      if (this.currentPoly) {
        this.updateFloatingArea(e.latLng);
      }
    };

    const handleRightClick = (e: any) => {
      if (this.currentPoly) {
        const path = this.currentPoly.getPath();
        if (path.length >= 3) {
          const area = Math.round(this.currentPoly.getArea());
          const lastPos = path[path.length - 1];
          
          // 플로우팅 선, 폴리곤 및 오버레이 제거
          if (this.floatingLine) {
            this.floatingLine.setMap(null);
            this.floatingLine = null;
          }
          if (this.floatingPoly) {
            this.floatingPoly.setMap(null);
            this.floatingPoly = null;
          }
          if (this.floatingOverlay) {
            this.floatingOverlay.setMap(null);
            this.floatingOverlay = null;
          }
          
          // 총 면적 표시 및 UI 생성
          this.showTotalArea(area, lastPos);
          
          // 콜백 호출
          if (this.onAreaCalculated) {
            this.onAreaCalculated(area);
          }
          
          this.currentPoly = null;
          this.map.setCursor('default');
        }
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
   * 총 면적 표시 UI 생성
   */
  private showTotalArea(area: number, lastPos: any): void {
    // 텍스트 닫기 버튼
    const textCloseBtn = document.createElement('button');
    textCloseBtn.innerHTML = '✕';
    textCloseBtn.style.cssText = 'position:absolute; top:-8px; right:-8px; width:20px; height:20px; border-radius:50%; background:#999; color:white; border:none; cursor:pointer; font-size:12px; line-height:1; box-shadow:0 2px 4px rgba(0,0,0,0.3); pointer-events: auto; z-index: 1000;';
    textCloseBtn.title = '텍스트 박스 닫기';
    
    const content = document.createElement('div');
    content.style.position = 'relative';
    content.style.pointerEvents = 'none';
    content.innerHTML = `<div class="measure-label" style="background:white; border:2px solid #39f; padding:4.2px 5.6px; border-radius:4px; font-size:9.8px; font-weight:bold; color:#39f; pointer-events: none;">면적: ${area}m²</div>`;
    content.appendChild(textCloseBtn);
    
    // 이벤트 전파 방지
    content.addEventListener('mousedown', (e: any) => e.stopPropagation());
    content.addEventListener('mouseup', (e: any) => e.stopPropagation());
    content.addEventListener('click', (e: any) => e.stopPropagation());
    
    const areaOverlay = new window.kakao.maps.CustomOverlay({
      map: this.map,
      position: lastPos,
      content: content,
      yAnchor: 2,
      zIndex: 100
    });
    
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
    
    // 버튼 이벤트 핸들러
    const savedCurrentPoly = this.currentPoly;
    
    const handleTextCloseBtnClick = (e: any) => {
      e.stopPropagation();
      e.preventDefault();
      this.isButtonClick = true;
      
      areaOverlay.setMap(null);
    };
    
    const handleDeleteBtnClick = (e: any) => {
      e.stopPropagation();
      e.preventDefault();
      this.isButtonClick = true;
      
      if (savedCurrentPoly) {
        savedCurrentPoly.setMap(null);
      }
      areaOverlay.setMap(null);
      deleteBtnOverlay.setMap(null);
    };
    
    textCloseBtn.addEventListener('mousedown', (e: any) => { e.stopPropagation(); e.preventDefault(); }, true);
    textCloseBtn.addEventListener('mouseup', (e: any) => { e.stopPropagation(); e.preventDefault(); }, true);
    textCloseBtn.addEventListener('click', handleTextCloseBtnClick, true);
    
    deleteBtn.addEventListener('mousedown', (e: any) => { e.stopPropagation(); e.preventDefault(); }, true);
    deleteBtn.addEventListener('mouseup', (e: any) => { e.stopPropagation(); e.preventDefault(); }, true);
    deleteBtn.addEventListener('click', handleDeleteBtnClick, true);
  }
}
