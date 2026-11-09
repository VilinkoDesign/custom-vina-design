"use strict";

(function (global) {

  const ContextMenu = {
    el: null,
    pos: null,
    open: false,
    clipboard: null,

    _deps: null,

    init: function (deps) {
      this._deps = deps;
      this._injectStyles();
      this._attachEvents();
    },

    _injectStyles: function () {
      if (document.getElementById('ctx-menu-styles')) return;
      const style = document.createElement('style');
      style.id = 'ctx-menu-styles';
      style.textContent = `
        .ctx-menu {
          position: fixed;
          z-index: 99998;
          min-width: 168px;
          background: #fff;
          border: 1px solid #111;
          border-radius: 10px;
          box-shadow: 0 12px 28px rgba(17, 17, 17, .16);
          padding: 5px;
          display: none;
          user-select: none;
          font-family: "Segoe UI", "Microsoft YaHei", system-ui, -apple-system, sans-serif;
          animation: ctxIn .12s ease both;
        }
        @keyframes ctxIn {
          from { opacity: 0; transform: translateY(-2px); }
          to   { opacity: 1; transform: none; }
        }
        .ctx-menu.show { display: block; }
        .ctx-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          padding: 8px 12px;
          border: none;
          border-radius: 6px;
          background: transparent;
          text-align: left;
          font-family: inherit;
          font-size: 12.5px;
          color: #111;
          cursor: pointer;
          transition: background .12s ease, color .12s ease;
        }
        .ctx-item:hover:not(:disabled) {
          background: rgba(82, 121, 251, .1);
          color: #5279FB;
        }
        .ctx-item:disabled {
          color: #9a9a9a;
          cursor: default;
        }
        .ctx-item .ctx-shortcut {
          font-family: "Cascadia Code", Consolas, monospace;
          font-size: 10.5px;
          color: #9a9a9a;
          margin-left: 16px;
        }
        .ctx-item:hover:not(:disabled) .ctx-shortcut {
          color: rgba(82, 121, 251, .7);
        }
        .ctx-sep {
          height: 1px;
          background: #e2e2e2;
          margin: 4px 6px;
        }
      `;
      document.head.appendChild(style);
    },

    _attachEvents: function () {
      const deps = this._deps;
      const self = this;

      window.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        self.close();

        if (deps.state.running) return;
        if (!deps.canvasWrap.contains(e.target)) return;

        const node = e.target.closest('.el');
        if (node) {
          const el = deps.getElement(node.dataset.id);
          if (el) deps.select(el.id);
        } else {
          deps.select(null);
        }

        self._open(e.clientX, e.clientY);
      });

      document.addEventListener('pointerdown', function (e) {
        if (!self.open) return;
        if (self.el && self.el.contains(e.target)) return;
        self.close();
      }, false);

      window.addEventListener('blur', function () { self.close(); });
      window.addEventListener('resize', function () { self.close(); });

      window.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') self.close();
      });

      /* Ctrl+C / Ctrl+V 快捷键 */
      window.addEventListener('keydown', function (e) {
        const tag = (e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
        if (deps.state.running) return;

        if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
          const el = deps.getSelected();
          if (!el) return;
          e.preventDefault();
          self.copy();
        } else if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
          if (!self.clipboard) return;
          e.preventDefault();
          const sel = deps.getSelected();
          const x = sel ? sel.x + 20 : deps.state.boardW / 2;
          const y = sel ? sel.y + 20 : deps.state.boardH / 2;
          self._paste(x, y);
        }
      });
    },

    _getMenu: function () {
      if (this.el) return this.el;
      const self = this;
      const deps = this._deps;

      this.el = document.createElement('div');
      this.el.className = 'ctx-menu';
      this.el.innerHTML = `
        <button class="ctx-item" data-action="delete" type="button">
          <span>删除组件</span><span class="ctx-shortcut">Del</span>
        </button>
        <button class="ctx-item" data-action="copy" type="button">
          <span>复制</span><span class="ctx-shortcut">Ctrl+C</span>
        </button>
        <div class="ctx-sep"></div>
        <button class="ctx-item" data-action="paste" type="button">
          <span>粘贴</span><span class="ctx-shortcut">Ctrl+V</span>
        </button>
      `;
      document.body.appendChild(this.el);

      this.el.addEventListener('pointerdown', function (e) { e.stopPropagation(); });

      this.el.addEventListener('click', function (e) {
        const btn = e.target.closest('.ctx-item');
        if (!btn || btn.disabled) return;

        const action = btn.dataset.action;
        const pos = self.pos;
        self.close();

        if (action === 'delete') {
          if (deps.state.selectedId) deps.removeElement(deps.state.selectedId);
        } else if (action === 'copy') {
          self.copy();
        } else if (action === 'paste') {
          if (self.clipboard && pos) self._paste(pos.x, pos.y);
        }
      });

      return this.el;
    },

    _open: function (clientX, clientY) {
      const menu = this._getMenu();
      const deps = this._deps;

      const delBtn   = menu.querySelector('[data-action="delete"]');
      const copyBtn  = menu.querySelector('[data-action="copy"]');
      const pasteBtn = menu.querySelector('[data-action="paste"]');

      delBtn.disabled   = !deps.state.selectedId || deps.state.running;
      copyBtn.disabled  = !deps.state.selectedId || deps.state.running;
      pasteBtn.disabled = !this.clipboard || deps.state.running;

      this.pos = deps.clientToBoard(clientX, clientY);

      menu.classList.add('show');
      this.open = true;

      const rect = menu.getBoundingClientRect();
      let left = clientX;
      let top  = clientY;
      if (left + rect.width  > window.innerWidth  - 8) left = window.innerWidth  - rect.width  - 8;
      if (top  + rect.height > window.innerHeight - 8) top  = window.innerHeight - rect.height - 8;
      if (left < 8) left = 8;
      if (top  < 8) top  = 8;
      menu.style.left = left + 'px';
      menu.style.top  = top  + 'px';
    },

    close: function () {
      if (this.el) this.el.classList.remove('show');
      this.open = false;
    },

    copy: function () {
      const deps = this._deps;
      const el = deps.getSelected();
      if (!el) return;
      this.clipboard = {
        type: el.type,
        w: el.w,
        h: el.h,
        props: JSON.parse(JSON.stringify(el.props))
      };
      deps.toast('已复制组件');
    },

    _paste: function (x, y) {
      if (!this.clipboard) return;
      const deps = this._deps;

      const el = {
        id: deps.nextId(),
        type: this.clipboard.type,
        seq: deps.nextSeq(this.clipboard.type),
        x: 0, y: 0,
        w: this.clipboard.w,
        h: this.clipboard.h,
        props: JSON.parse(JSON.stringify(this.clipboard.props))
      };

      el.x = Math.round(deps.clamp(x - el.w / 2, 0, Math.max(0, deps.state.boardW - el.w)));
      el.y = Math.round(deps.clamp(y - el.h / 2, 0, Math.max(0, deps.state.boardH - el.h)));

      deps.state.elements.push(el);
      deps.renderElement(el);
      deps.updateEmptyHint();
      deps.select(el.id);
      deps.saveState();
      deps.toast('已粘贴组件');
    }
  };

  global.ContextMenu = ContextMenu;

})(window);