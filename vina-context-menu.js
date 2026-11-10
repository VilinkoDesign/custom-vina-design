/* Copyright © 2026 Vilinko Studio */
/* vina-context-menu.js version 1.1 */

"use strict";

(function (global) {

  const STYLE_ID = 'vina-ctx-menu-styles';

  const DEFAULT_THEME = {
    background: '#fff',
    borderColor: '#111',
    borderRadius: 10,
    padding: 5,
    minWidth: 168,
    boxShadow: '0 12px 28px rgba(17, 17, 17, .16)',
    fontFamily: '"Segoe UI", "Microsoft YaHei", system-ui, -apple-system, sans-serif',

    itemPadding: '8px 12px',
    itemBorderRadius: 6,
    itemColor: '#111',
    itemFontSize: 12.5,
    itemHoverBackground: 'rgba(82, 121, 251, .1)',
    itemHoverColor: '#5279FB',
    itemDisabledColor: '#9a9a9a',

    iconGap: 8,
    iconSize: 14,

    shortcutColor: '#9a9a9a',
    shortcutFontSize: 10.5,
    shortcutMarginLeft: 16,
    shortcutFontFamily: '"Cascadia Code", Consolas, monospace',

    separatorColor: '#e2e2e2',
    separatorMargin: '4px 6px'
  };

  const NUMERIC_PX_THEME_KEYS = {
    borderRadius: true, padding: true, minWidth: true,
    itemBorderRadius: true, itemFontSize: true,
    iconGap: true, iconSize: true,
    shortcutFontSize: true, shortcutMarginLeft: true
  };

  const THEME_VAR_MAP = {
    background: '--vcm-background',
    borderColor: '--vcm-border-color',
    borderRadius: '--vcm-border-radius',
    padding: '--vcm-padding',
    minWidth: '--vcm-min-width',
    boxShadow: '--vcm-box-shadow',
    fontFamily: '--vcm-font-family',
    itemPadding: '--vcm-item-padding',
    itemBorderRadius: '--vcm-item-border-radius',
    itemColor: '--vcm-item-color',
    itemFontSize: '--vcm-item-font-size',
    itemHoverBackground: '--vcm-item-hover-bg',
    itemHoverColor: '--vcm-item-hover-color',
    itemDisabledColor: '--vcm-item-disabled-color',
    iconGap: '--vcm-icon-gap',
    iconSize: '--vcm-icon-size',
    shortcutColor: '--vcm-shortcut-color',
    shortcutFontSize: '--vcm-shortcut-font-size',
    shortcutMarginLeft: '--vcm-shortcut-margin-left',
    shortcutFontFamily: '--vcm-shortcut-font-family',
    separatorColor: '--vcm-separator-color',
    separatorMargin: '--vcm-separator-margin'
  };

  function themeToVars(theme) {
    const parts = [];
    for (const key in theme) {
      if (!Object.prototype.hasOwnProperty.call(theme, key)) continue;
      const cssVar = THEME_VAR_MAP[key];
      if (!cssVar) continue;
      let value = theme[key];
      if (typeof value === 'number' && NUMERIC_PX_THEME_KEYS[key]) value += 'px';
      parts.push(cssVar + ': ' + value);
    }
    return parts.join('; ');
  }

  const BASE_CSS = `
.vina-ctx-menu {
  --vcm-background: #fff;
  --vcm-border-color: #111;
  --vcm-border-radius: 10px;
  --vcm-padding: 5px;
  --vcm-min-width: 168px;
  --vcm-box-shadow: 0 12px 28px rgba(17,17,17,.16);
  --vcm-font-family: "Segoe UI", "Microsoft YaHei", system-ui, -apple-system, sans-serif;

  --vcm-item-padding: 8px 12px;
  --vcm-item-border-radius: 6px;
  --vcm-item-color: #111;
  --vcm-item-font-size: 12.5px;
  --vcm-item-hover-bg: rgba(82, 121, 251, .1);
  --vcm-item-hover-color: #5279FB;
  --vcm-item-disabled-color: #9a9a9a;

  --vcm-icon-gap: 8px;
  --vcm-icon-size: 14px;

  --vcm-shortcut-color: #9a9a9a;
  --vcm-shortcut-font-size: 10.5px;
  --vcm-shortcut-margin-left: 16px;
  --vcm-shortcut-font-family: "Cascadia Code", Consolas, monospace;

  --vcm-separator-color: #e2e2e2;
  --vcm-separator-margin: 4px 6px;

  --vcm-z-index: 99998;
  --vcm-anim-duration: 120ms;

  position: fixed;
  z-index: var(--vcm-z-index);
  min-width: var(--vcm-min-width);
  background: var(--vcm-background);
  border: 1px solid var(--vcm-border-color);
  border-radius: var(--vcm-border-radius);
  box-shadow: var(--vcm-box-shadow);
  padding: var(--vcm-padding);
  display: none;
  user-select: none;
  font-family: var(--vcm-font-family);
}
.vina-ctx-menu.show { display: block; }

html[data-theme="dark"] .vina-ctx-menu {
  --vcm-background: #141414;
  --vcm-border-color: #e6e6e6;
  --vcm-item-color: #e6e6e6;
  --vcm-item-hover-bg: rgba(154, 177, 250, .15);
  --vcm-item-hover-color: #9ab1fa;
  --vcm-item-disabled-color: #737373;
  --vcm-shortcut-color: #737373;
  --vcm-separator-color: #262626;
  --vcm-box-shadow: 0 12px 28px rgba(0, 0, 0, .6);
}

.vina-ctx-menu[data-anim="slide"] {
  animation: vinaCtxSlide var(--vcm-anim-duration) ease both;
}
.vina-ctx-menu[data-anim="fade"] {
  animation: vinaCtxFade var(--vcm-anim-duration) ease both;
}
.vina-ctx-menu[data-anim="none"] { animation: none; }

@keyframes vinaCtxSlide {
  from { opacity: 0; transform: translateY(-2px); }
  to   { opacity: 1; transform: none; }
}
@keyframes vinaCtxFade {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.vina-ctx-menu .vina-ctx-item {
  display: flex;
  align-items: center;
  gap: var(--vcm-icon-gap);
  width: 100%;
  padding: var(--vcm-item-padding);
  border: none;
  border-radius: var(--vcm-item-border-radius);
  background: transparent;
  text-align: left;
  font-family: inherit;
  font-size: var(--vcm-item-font-size);
  color: var(--vcm-item-color);
  cursor: pointer;
  transition: background .12s ease, color .12s ease;
}
.vina-ctx-menu .vina-ctx-item:hover:not(:disabled) {
  background: var(--vcm-item-hover-bg);
  color: var(--vcm-item-hover-color);
}
.vina-ctx-menu .vina-ctx-item:disabled {
  color: var(--vcm-item-disabled-color);
  cursor: default;
}
.vina-ctx-menu .vina-ctx-item-icon {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--vcm-icon-size);
  height: var(--vcm-icon-size);
  font-size: var(--vcm-icon-size);
  line-height: 1;
}
.vina-ctx-menu .vina-ctx-item-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.vina-ctx-menu .vina-ctx-item-arrow {
  flex: none;
  margin-left: 8px;
  font-size: 10px;
  color: var(--vcm-item-disabled-color);
}
.vina-ctx-menu .vina-ctx-shortcut {
  flex: none;
  font-family: var(--vcm-shortcut-font-family);
  font-size: var(--vcm-shortcut-font-size);
  color: var(--vcm-shortcut-color);
  margin-left: var(--vcm-shortcut-margin-left);
}
.vina-ctx-menu .vina-ctx-item:hover:not(:disabled) .vina-ctx-shortcut {
  color: var(--vcm-item-hover-color);
  opacity: 0.7;
}
.vina-ctx-menu .vina-ctx-sep {
  height: 1px;
  background: var(--vcm-separator-color);
  margin: var(--vcm-separator-margin);
}
.vina-ctx-menu .vina-ctx-header,
.vina-ctx-menu .vina-ctx-footer {
  padding: 4px 8px;
}
`;

  class VinaContextMenu {
    constructor(options) {
      options = options || {};
      this.options = {
        container:            options.container != null ? options.container : null,
        items:                options.items || [],
        shortcuts:            options.shortcuts || [],
        theme:                options.theme || {},
        className:            options.className || '',
        injectStyles:         options.injectStyles !== false,
        zIndex:               options.zIndex || 99998,
        animation:            options.animation || 'slide',
        animationDuration:    options.animationDuration != null ? options.animationDuration : 120,
        positionStrategy:     options.positionStrategy || 'auto',
        offsetX:              options.offsetX || 0,
        offsetY:              options.offsetY || 0,
        viewportPadding:      options.viewportPadding != null ? options.viewportPadding : 8,
        preventDefaultGlobal: options.preventDefaultGlobal !== false,
        renderItem:           options.renderItem || null,
        renderSeparator:      options.renderSeparator || null,
        onBeforeRender:       options.onBeforeRender || null,
        renderHeader:         options.renderHeader || null,
        renderFooter:         options.renderFooter || null,
        onBeforeOpen:         options.onBeforeOpen || null,
        onOpen:               options.onOpen || null,
        onClose:              options.onClose || null
      };

      this.menu = null;
      this.submenu = null;
      this.opened = false;
      this._attached = false;
      this._containerEl = this._resolveContainer(this.options.container);
      this._ctx = null;
      this._hoverTimer = null;

      this._onContext        = this._onContext.bind(this);
      this._onDocPointerDown = this._onDocPointerDown.bind(this);
      this._onBlur           = this._onBlur.bind(this);
      this._onResize         = this._onResize.bind(this);
      this._onKeyDown        = this._onKeyDown.bind(this);

      if (this.options.injectStyles) this._injectStyles();
    }

    _injectStyles() {
      if (document.getElementById(STYLE_ID)) return;
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = BASE_CSS;
      document.head.appendChild(style);
    }

    _resolveContainer(c) {
      if (!c) return null;
      if (typeof c === 'string') return document.querySelector(c);
      return c;
    }

    _ensureMenu() {
      if (this.menu) return this.menu;

      const menu = document.createElement('div');
      menu.className = 'vina-ctx-menu';
      if (this.options.className) menu.className += ' ' + this.options.className;

      menu.style.zIndex = String(this.options.zIndex);
      menu.dataset.anim = this.options.animation;
      menu.style.setProperty('--vcm-anim-duration', this.options.animationDuration + 'ms');

      const themeVars = themeToVars(this.options.theme);
      if (themeVars) menu.setAttribute('style',
        (menu.getAttribute('style') || '') + ';' + themeVars);

      menu.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
      document.body.appendChild(menu);
      this.menu = menu;
      return menu;
    }

    _ensureSubmenu() {
      if (this.submenu) return this.submenu;

      const sub = document.createElement('div');
      sub.className = 'vina-ctx-menu vina-ctx-submenu';
      if (this.options.className) sub.className += ' ' + this.options.className;

      sub.style.zIndex = String(this.options.zIndex + 1);
      sub.dataset.anim = this.options.animation;
      sub.style.setProperty('--vcm-anim-duration', this.options.animationDuration + 'ms');

      const themeVars = themeToVars(this.options.theme);
      if (themeVars) sub.setAttribute('style',
        (sub.getAttribute('style') || '') + ';' + themeVars);

      sub.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
      document.body.appendChild(sub);
      this.submenu = sub;
      return sub;
    }

    _renderItems(container, items) {
      const ctx = this._ctx;

      items.forEach((item, i) => {
        if (!item) return;

        if (item.separator) {
          const sep = this._makeSeparator(item, ctx);
          container.appendChild(sep);
          return;
        }

        const btn = this._makeItem(item, ctx, i);
        container.appendChild(btn);
      });
    }

    _makeSeparator(item, ctx) {
      if (typeof this.options.renderSeparator === 'function') {
        const custom = this.options.renderSeparator(item, ctx);
        if (custom instanceof HTMLElement) return custom;
      }
      const sep = document.createElement('div');
      sep.className = 'vina-ctx-sep';
      return sep;
    }

    _makeItem(item, ctx, index) {
      if (typeof this.options.renderItem === 'function') {
        const defaultEl = this._defaultItemEl(item, ctx, index);
        const custom = this.options.renderItem(item, ctx, defaultEl);
        if (custom instanceof HTMLElement) return custom;
        return defaultEl;
      }
      return this._defaultItemEl(item, ctx, index);
    }

    _defaultItemEl(item, ctx, index) {
      const self = this;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'vina-ctx-item';
      if (item.className) btn.className += ' ' + item.className;
      btn.dataset.key = item.key || ('item-' + index);

      if (item.style) {
        if (typeof item.style === 'string') {
          btn.setAttribute('style', item.style);
        } else if (typeof item.style === 'object') {
          Object.assign(btn.style, item.style);
        }
      }

      if (item.icon != null) {
        const iconEl = document.createElement('span');
        iconEl.className = 'vina-ctx-item-icon';
        this._applyIcon(iconEl, item.icon, item, ctx);
        btn.appendChild(iconEl);
      }

      const label = document.createElement('span');
      label.className = 'vina-ctx-item-label';
      label.textContent = item.label || '';
      btn.appendChild(label);

      const hasChildren = Array.isArray(item.children) && item.children.length > 0;
      if (hasChildren) {
        const arrow = document.createElement('span');
        arrow.className = 'vina-ctx-item-arrow';
        arrow.textContent = '▸';
        btn.appendChild(arrow);
      } else if (item.shortcut) {
        const sc = document.createElement('span');
        sc.className = 'vina-ctx-shortcut';
        sc.textContent = item.shortcut;
        btn.appendChild(sc);
      }

      const disabled = typeof item.isDisabled === 'function'
        ? !!item.isDisabled(ctx)
        : !!item.disabled;
      if (disabled) btn.disabled = true;

      if (hasChildren) {
        btn.addEventListener('pointerenter', function () {
          clearTimeout(self._hoverTimer);
          self._hoverTimer = setTimeout(function () {
            self._showSubmenu(item, btn);
          }, 80);
        });
        btn.addEventListener('pointerleave', function () {
          clearTimeout(self._hoverTimer);
          self._hoverTimer = setTimeout(function () {
            self._hideSubmenu();
          }, 160);
        });
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
        });
      } else {
        btn.addEventListener('pointerenter', function () {
          clearTimeout(self._hoverTimer);
          self._hoverTimer = setTimeout(function () {
            self._hideSubmenu();
          }, 80);
        });
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          if (btn.disabled) return;
          const ctxNow = self._ctx;
          self.close();
          try {
            if (typeof item.onClick === 'function') item.onClick(ctxNow);
          } catch (err) {
            console.error('[VinaContextMenu] onClick error:', err);
          }
        });
      }

      return btn;
    }

    _applyIcon(iconEl, icon, item, ctx) {
      if (typeof icon === 'function') {
        try {
          const r = icon(item, ctx);
          if (r instanceof HTMLElement) { iconEl.appendChild(r); return; }
          if (typeof r === 'string') { iconEl.textContent = r; return; }
        } catch (err) { console.error('[VinaContextMenu] icon function error:', err); }
        return;
      }
      if (icon instanceof HTMLElement) { iconEl.appendChild(icon); return; }
      iconEl.textContent = String(icon);
    }

    _render() {
      const menu = this._ensureMenu();
      menu.innerHTML = '';

      if (typeof this.options.onBeforeRender === 'function') {
        try { this.options.onBeforeRender(menu, this.options.items); }
        catch (err) { console.error('[VinaContextMenu] onBeforeRender error:', err); }
      }

      if (typeof this.options.renderHeader === 'function') {
        const h = this.options.renderHeader(menu, this._ctx);
        if (h instanceof HTMLElement) menu.appendChild(h);
        else if (typeof h === 'string') {
          const wrap = document.createElement('div');
          wrap.className = 'vina-ctx-header';
          wrap.textContent = h;
          menu.appendChild(wrap);
        }
      }

      this._renderItems(menu, this.options.items);

      if (typeof this.options.renderFooter === 'function') {
        const f = this.options.renderFooter(menu, this._ctx);
        if (f instanceof HTMLElement) menu.appendChild(f);
        else if (typeof f === 'string') {
          const wrap = document.createElement('div');
          wrap.className = 'vina-ctx-footer';
          wrap.textContent = f;
          menu.appendChild(wrap);
        }
      }
    }

    _showSubmenu(item, anchorEl) {
      if (!this.menu || !this.opened) return;
      if (!Array.isArray(item.children) || !item.children.length) return;

      const sub = this._ensureSubmenu();
      sub.innerHTML = '';
      this._renderItems(sub, item.children);
      sub.classList.add('show');

      const rect = anchorEl.getBoundingClientRect();
      const subRect = sub.getBoundingClientRect();
      const padding = this.options.viewportPadding;

      let left = rect.right + 4;
      let top = rect.top;
      if (left + subRect.width > window.innerWidth - padding) {
        left = rect.left - subRect.width - 4;
      }
      if (top + subRect.height > window.innerHeight - padding) {
        top = window.innerHeight - subRect.height - padding;
      }
      if (top < padding) top = padding;

      sub.style.left = left + 'px';
      sub.style.top = top + 'px';
    }

    _hideSubmenu() {
      if (this.submenu) this.submenu.classList.remove('show');
    }

    _onContext(e) {
      const inContainer = this._containerEl ? this._containerEl.contains(e.target) : true;

      if (this.options.preventDefaultGlobal || inContainer) {
        e.preventDefault();
      }

      this.close();

      if (!inContainer) return;

      const ctx = {
        x: e.clientX,
        y: e.clientY,
        target: e.target,
        event: e
      };

      if (typeof this.options.onBeforeOpen === 'function') {
        const r = this.options.onBeforeOpen(ctx);
        if (r === false) return;
      }

      this.open(ctx.x, ctx.y, ctx);
    }

    open(x, y, ctx) {
      this._ctx = ctx || { x: x, y: y };
      this._render();

      const menu = this.menu;
      menu.classList.add('show');
      this.opened = true;

      const rect = menu.getBoundingClientRect();
      const padding = this.options.viewportPadding;
      let left, top;

      if (this.options.positionStrategy === 'cursor') {
        left = x + this.options.offsetX;
        top = y + this.options.offsetY;
      } else if (typeof this.options.positionStrategy === 'function') {
        const r = this.options.positionStrategy(x, y, rect, {
          width: window.innerWidth,
          height: window.innerHeight,
          padding: padding
        });
        left = r && r.left != null ? r.left : x;
        top = r && r.top != null ? r.top : y;
      } else {
        left = x + this.options.offsetX;
        top = y + this.options.offsetY;
        if (left + rect.width > window.innerWidth - padding) {
          left = window.innerWidth - rect.width - padding;
        }
        if (top + rect.height > window.innerHeight - padding) {
          top = window.innerHeight - rect.height - padding;
        }
        if (left < padding) left = padding;
        if (top < padding) top = padding;
      }

      menu.style.left = left + 'px';
      menu.style.top = top + 'px';

      if (typeof this.options.onOpen === 'function') {
        try { this.options.onOpen(this._ctx); } catch (err) { console.error(err); }
      }
    }

    close() {
      clearTimeout(this._hoverTimer);
      this._hideSubmenu();
      if (this.menu && this.opened) {
        this.menu.classList.remove('show');
      }
      const wasOpen = this.opened;
      this.opened = false;
      if (wasOpen && typeof this.options.onClose === 'function') {
        try { this.options.onClose(); } catch (err) { console.error(err); }
      }
    }

    isOpened() { return this.opened; }

    setItems(items) {
      this.options.items = items || [];
      if (this.opened) this._render();
    }
    setShortcuts(shortcuts) { this.options.shortcuts = shortcuts || []; }
    setContainer(c) { this._containerEl = this._resolveContainer(c); }
    setTheme(theme) {
      this.options.theme = Object.assign({}, this.options.theme, theme || {});
      if (this.menu) {
        const vars = themeToVars(this.options.theme);
        if (vars) this.menu.setAttribute('style',
          (this.menu.getAttribute('style') || '') + ';' + vars);
      }
      if (this.submenu) {
        const vars = themeToVars(this.options.theme);
        if (vars) this.submenu.setAttribute('style',
          (this.submenu.getAttribute('style') || '') + ';' + vars);
      }
    }

    attach() {
      if (this._attached) return this;
      this._attached = true;

      window.addEventListener('contextmenu', this._onContext);
      document.addEventListener('pointerdown', this._onDocPointerDown, false);
      window.addEventListener('blur', this._onBlur);
      window.addEventListener('resize', this._onResize);
      window.addEventListener('keydown', this._onKeyDown);

      return this;
    }

    detach() {
      if (!this._attached) return this;
      this._attached = false;

      window.removeEventListener('contextmenu', this._onContext);
      document.removeEventListener('pointerdown', this._onDocPointerDown, false);
      window.removeEventListener('blur', this._onBlur);
      window.removeEventListener('resize', this._onResize);
      window.removeEventListener('keydown', this._onKeyDown);

      this.close();
      return this;
    }

    _onDocPointerDown(e) {
      if (!this.opened) return;
      if (this.menu && this.menu.contains(e.target)) return;
      if (this.submenu && this.submenu.contains(e.target)) return;
      this.close();
    }

    _onBlur() { this.close(); }
    _onResize() { this.close(); }

    _onKeyDown(e) {
      if (e.key === 'Escape') {
        if (this.opened) {
          e.preventDefault();
          this.close();
        }
        return;
      }

      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.target.isContentEditable) return;

      const shortcuts = this.options.shortcuts || [];
      for (let i = 0; i < shortcuts.length; i++) {
        const sc = shortcuts[i];
        if (String(sc.key).toLowerCase() !== String(e.key).toLowerCase()) continue;

        const ctrlMatch  = !!sc.ctrl  === (e.ctrlKey || e.metaKey);
        const shiftMatch = !!sc.shift === e.shiftKey;
        const altMatch   = !!sc.alt   === e.altKey;
        if (!ctrlMatch || !shiftMatch || !altMatch) continue;

        try {
          const r = sc.handler && sc.handler(e);
          if (r !== false) {
            e.preventDefault();
            e.stopPropagation();
          }
        } catch (err) {
          console.error('[VinaContextMenu] shortcut error:', err);
        }
        return;
      }
    }
  }

  VinaContextMenu.DEFAULT_THEME = DEFAULT_THEME;

  global.VinaContextMenu = VinaContextMenu;

})(window);