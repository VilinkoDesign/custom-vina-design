"use strict";

(function (global) {

  const TouchDrag = {
    canvasScale: 1,
    drag: null,
    pinchState: null,
    touchPointers: new Map(),

    CANVAS_SCALE_MIN: 0.25,
    CANVAS_SCALE_MAX: 2,
    CANVAS_SCALE_STEP: 0.1,

    _deps: null,

    init: function (deps) {
      this._deps = deps;
      this._attachEvents();
      this.setCanvasScale(1);
    },

    applyCanvasScale: function () {
      this._deps.board.style.transform = `scale(${this.canvasScale})`;
    },

    setCanvasScale: function (v) {
      this.canvasScale = this._deps.clamp(
        this._deps.round(v, 3),
        this.CANVAS_SCALE_MIN,
        this.CANVAS_SCALE_MAX
      );
      this.applyCanvasScale();
    },

    boardPos: function (evt) {
      const r = this._deps.board.getBoundingClientRect();
      return {
        x: (evt.clientX - r.left) / this.canvasScale,
        y: (evt.clientY - r.top) / this.canvasScale
      };
    },

    clientToBoard: function (clientX, clientY) {
      const r = this._deps.board.getBoundingClientRect();
      return {
        x: (clientX - r.left) / this.canvasScale,
        y: (clientY - r.top) / this.canvasScale
      };
    },

    syncLayoutInputs: function (el) {
      const deps = this._deps;
      const map = { x: el.x, y: el.y, w: el.w, h: el.h };
      deps.inspBody.querySelectorAll('input[data-key]').forEach(function (inp) {
        const k = inp.dataset.key;
        if (!k) return;
        if (k in map && document.activeElement !== inp) inp.value = map[k];
      });
    },

    _getPointerDistance: function (a, b) {
      const dx = a.x - b.x, dy = a.y - b.y;
      return Math.sqrt(dx * dx + dy * dy);
    },

    _attachEvents: function () {
      const deps = this._deps;
      const self = this;
      const { canvasWrap, board } = deps;

      /* 滚轮缩放 */
      canvasWrap.addEventListener('wheel', function (e) {
        e.preventDefault();
        if (self.drag) return;
        const dir = e.deltaY < 0 ? 1 : -1;
        self.setCanvasScale(self.canvasScale + dir * self.CANVAS_SCALE_STEP);
      }, { passive: false });

      /* 双指捏合 */
      canvasWrap.addEventListener('pointerdown', function (e) {
        if (e.pointerType !== 'touch') return;
        try { canvasWrap.setPointerCapture(e.pointerId); } catch (err) {}
        self.touchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (self.touchPointers.size === 2) {
          self.drag = null;
          self.pinchState = null;
          const pts = Array.from(self.touchPointers.values());
          const dist = self._getPointerDistance(pts[0], pts[1]);
          if (dist > 0) self.pinchState = { startDistance: dist, startScale: self.canvasScale };
        }
      }, { passive: true });

      canvasWrap.addEventListener('pointermove', function (e) {
        if (e.pointerType !== 'touch') return;
        if (!self.touchPointers.has(e.pointerId)) return;
        self.touchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (self.touchPointers.size !== 2 || !self.pinchState) return;
        const pts = Array.from(self.touchPointers.values());
        const dist = self._getPointerDistance(pts[0], pts[1]);
        if (self.pinchState.startDistance <= 0) return;
        const ratio = dist / self.pinchState.startDistance;
        self.setCanvasScale(self.pinchState.startScale * ratio);
        e.preventDefault();
      }, { passive: false });

      function endTouchPointer(e) {
        if (e.pointerType !== 'touch') return;
        self.touchPointers.delete(e.pointerId);
        if (self.touchPointers.size < 2) self.pinchState = null;
      }
      canvasWrap.addEventListener('pointerup', endTouchPointer);
      canvasWrap.addEventListener('pointercancel', endTouchPointer);
      canvasWrap.addEventListener('lostpointercapture', endTouchPointer);

      /* 组件库拖拽 */
      this._buildComponentList();

      /* 画布内拖动 / 缩放 */
      board.addEventListener('pointerdown', function (e) {
        if (deps.state.running) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (self.drag || self.pinchState) return;

        const node = e.target.closest('.el');
        if (!node) { deps.select(null); return; }

        const el = deps.getElement(node.dataset.id);
        if (!el) return;

        if (deps.state.selectedId !== el.id) deps.select(el.id);

        const pos = self.boardPos(e);
        const isResize = !!e.target.closest('.resize-handle');

        self.drag = {
          mode: isResize ? 'resize' : 'move',
          pointerId: e.pointerId,
          el: el,
          startX: pos.x, startY: pos.y,
          origX: el.x, origY: el.y,
          origW: el.w, origH: el.h
        };
        e.preventDefault();
      });

      window.addEventListener('pointermove', function (e) {
        if (!self.drag) return;
        if (e.pointerId !== self.drag.pointerId) return;

        const pos = self.boardPos(e);
        const dx = pos.x - self.drag.startX;
        const dy = pos.y - self.drag.startY;
        const el = self.drag.el;

        if (self.drag.mode === 'move') {
          el.x = Math.round(deps.clamp(self.drag.origX + dx, -el.w + 16, deps.state.boardW - 16));
          el.y = Math.round(deps.clamp(self.drag.origY + dy, -el.h + 16, deps.state.boardH - 16));
        } else {
          el.w = Math.round(Math.max(8, self.drag.origW + dx));
          el.h = Math.round(Math.max(8, self.drag.origH + dy));
        }

        deps.renderElement(el);
        self.syncLayoutInputs(el);
      });

      window.addEventListener('pointerup', function (e) {
        if (!self.drag) return;
        if (e && e.pointerId !== self.drag.pointerId) return;
        self.drag = null;
        deps.saveState();
      });
      window.addEventListener('pointercancel', function (e) {
        if (!self.drag) return;
        if (e && e.pointerId !== self.drag.pointerId) return;
        self.drag = null;
        deps.saveState();
      });

      /* 键盘删除 */
      window.addEventListener('keydown', function (e) {
        if (e.key !== 'Delete' && e.key !== 'Backspace') return;
        if (deps.state.running) return;
        const tag = (e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
        if (!deps.state.selectedId) return;
        e.preventDefault();
        deps.removeElement(deps.state.selectedId);
      });
    },

    _buildComponentList: function () {
      const deps = this._deps;
      const self = this;

      deps.COMPONENTS.forEach(function (c) {
        const item = document.createElement('div');
        item.className = 'comp-item';
        item.dataset.type = c.type;
        item.innerHTML =
          `<span class="comp-glyph">${c.glyph}</span>
           <span class="comp-meta">
             <span class="comp-name">${c.name}</span><br>
             <span class="comp-type">${c.type}</span>
           </span>`;

        item.addEventListener('pointerdown', function (e) {
          if (deps.state.running) return;
          if (e.pointerType === 'mouse' && e.button !== 0) return;

          const pointerId = e.pointerId;
          const startX = e.clientX;
          const startY = e.clientY;

          let ghost = null;
          let activated = false;
          const THRESHOLD = 6;

          function onMove(ev) {
            if (ev.pointerId !== pointerId) return;

            if (!activated) {
              const d = Math.hypot(ev.clientX - startX, ev.clientY - startY);
              if (d < THRESHOLD) return;
              activated = true;

              ghost = document.createElement('div');
              ghost.className = 'drag-ghost';
              ghost.textContent = c.name;
              document.body.appendChild(ghost);
              item.classList.add('dragging');
            }

            ghost.style.left = ev.clientX + 'px';
            ghost.style.top  = ev.clientY + 'px';

            const r = deps.board.getBoundingClientRect();
            const inside =
              ev.clientX >= r.left && ev.clientX <= r.right &&
              ev.clientY >= r.top  && ev.clientY <= r.bottom;
            deps.board.classList.toggle('drag-over', inside);
          }

          function onEnd(ev) {
            if (ev.pointerId !== pointerId) return;

            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onEnd);
            window.removeEventListener('pointercancel', onEnd);

            item.classList.remove('dragging');
            deps.board.classList.remove('drag-over');

            if (ghost) { ghost.remove(); ghost = null; }

            if (!activated) return;
            if (ev.type === 'pointercancel') return;

            const r = deps.board.getBoundingClientRect();
            if (ev.clientX < r.left || ev.clientX > r.right ||
                ev.clientY < r.top  || ev.clientY > r.bottom) return;

            const pos = self.boardPos(ev);
            const el = deps.makeElement(c.type, 0, 0);
            el.x = Math.round(deps.clamp(pos.x - el.w / 2, 0, Math.max(0, deps.state.boardW - el.w)));
            el.y = Math.round(deps.clamp(pos.y - el.h / 2, 0, Math.max(0, deps.state.boardH - el.h)));

            deps.state.elements.push(el);
            deps.renderElement(el);
            deps.updateEmptyHint();
            deps.select(el.id);
            deps.saveState();
          }

          window.addEventListener('pointermove', onMove);
          window.addEventListener('pointerup', onEnd);
          window.addEventListener('pointercancel', onEnd);
          e.preventDefault();
        });

        deps.compList.appendChild(item);
      });
    }
  };

  global.TouchDrag = TouchDrag;

})(window);