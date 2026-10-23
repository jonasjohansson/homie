import Foundation

enum Scripts {
    /// WKWebView has no web Notification API. This shim forwards `new Notification()` to
    /// the app, which shows it through macOS. Clicking the banner brings the tab forward.
    static let notifications = """
    (function () {
      if (window.__homieNotifications) return;
      window.__homieNotifications = true;
      const post = (m) => { try { window.webkit.messageHandlers.homie.postMessage(m); } catch (e) {} };
      class HomieNotification extends EventTarget {
        constructor(title, options) {
          super();
          const o = options || {};
          this.title = String(title);
          this.body = o.body || '';
          this.tag = o.tag || '';
          this.icon = o.icon || '';
          this.data = o.data;
          this.silent = !!o.silent;
          post({ type: 'notification', title: this.title, body: this.body, tag: this.tag });
          setTimeout(() => this.dispatchEvent(new Event('show')), 0);
        }
        close() { this.dispatchEvent(new Event('close')); }
        static get permission() { return 'granted'; }
        static requestPermission(cb) { const p = Promise.resolve('granted'); if (cb) p.then(cb); return p; }
        static get maxActions() { return 0; }
      }
      for (const k of ['onclick', 'onshow', 'onerror', 'onclose']) {
        Object.defineProperty(HomieNotification.prototype, k, {
          set(fn) { this['__' + k] = fn; if (fn) this.addEventListener(k.slice(2), fn); },
          get() { return this['__' + k] || null; },
        });
      }
      window.Notification = HomieNotification;
      if (navigator.permissions && navigator.permissions.query) {
        const q = navigator.permissions.query.bind(navigator.permissions);
        navigator.permissions.query = (d) => d && d.name === 'notifications'
          ? Promise.resolve({ state: 'granted', onchange: null })
          : q(d);
      }
    })();
    """

    /// Silences a tab: media elements play muted and AudioContexts stay suspended.
    static let mute = """
    (function () {
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () { this.muted = true; this.volume = 0; return play.apply(this, arguments); };
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        const Muted = new Proxy(AC, {
          construct(target, args) {
            const ctx = new target(...args);
            ctx.suspend();
            ctx.resume = () => Promise.resolve();
            return ctx;
          },
        });
        window.AudioContext = Muted;
        window.webkitAudioContext = Muted;
      }
    })();
    """
}
