(function () {
  "use strict";
  var d = document.documentElement;
  var nav = navigator || {};
  var conn = nav.connection || nav.mozConnection || nav.webkitConnection || {};
  var cores = nav.hardwareConcurrency || 0;
  var ram = nav.deviceMemory || 0;
  var slowNet = /^(slow-2g|2g|3g)$/.test(conn.effectiveType || "");
  var saveData = conn.saveData === true;
  var lowEnd = (cores > 0 && cores <= 4) || (ram > 0 && ram <= 4) || slowNet || saveData || (window.matchMedia && window.matchMedia("(prefers-reduced-transparency: reduce)").matches);
  if (lowEnd) d.classList.add("is-lowend");
  if (saveData || slowNet) d.classList.add("is-savedata");
  window.ACPerf = {
    lowEnd: lowEnd,
    saveData: saveData || slowNet,
    _c: {},
    load: function (src) {
      if (this._c[src]) return this._c[src];
      this._c[src] = new Promise(function (res, rej) {
        var s = document.createElement("script");
        s.src = src; s.async = true; s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
      return this._c[src];
    },
    idle: function (fn, timeout) {
      if ("requestIdleCallback" in window) requestIdleCallback(fn, { timeout: timeout || 3000 });
      else setTimeout(fn, timeout || 1500);
    }
  };
})();
