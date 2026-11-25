/**
 * api-bridge.js
 * จำลอง google.script.run บน GitHub Pages เพื่อเชื่อมต่อกับ Google Apps Script Backend
 */
(function() {
  // URL ของ Google Apps Script Web App เดิม (ทำหน้าที่เป็นฐานข้อมูล API)
  var GAS_API_URL = 'https://script.google.com/macros/s/AKfycbwFr3O-GcrOnIGnxKZ-0owTxEdORla-THc49pOfhhs9F8RyRel9cufZVH6tGIFObE6uEA/exec';

  function createRunner(successHandler, failureHandler) {
    var runnerObj = {
      withSuccessHandler: function(fn) {
        return createRunner(fn, failureHandler);
      },
      withFailureHandler: function(fn) {
        return createRunner(successHandler, fn);
      }
    };

    return new Proxy(runnerObj, {
      get: function(target, prop) {
        if (prop in target) return target[prop];
        if (typeof prop !== 'string') return undefined;

        return function() {
          var args = Array.prototype.slice.call(arguments);

          // ใช้ text/plain;charset=utf-8 เพื่อส่งเป็น Simple Request ไม่ติด CORS Preflight ของ GAS
          fetch(GAS_API_URL, {
            method: 'POST',
            redirect: 'follow',
            headers: {
              'Content-Type': 'text/plain;charset=utf-8'
            },
            body: JSON.stringify({
              action: prop,
              args: args
            })
          })
          .then(function(response) {
            if (!response.ok) {
              throw new Error('เซิร์ฟเวอร์ตอบกลับผิดพลาด (HTTP ' + response.status + ')');
            }
            return response.text();
          })
          .then(function(rawText) {
            var parsed;
            try {
              parsed = JSON.parse(rawText);
            } catch (parseErr) {
              throw new Error('ข้อมูลจากเซิร์ฟเวอร์ไม่ใช่ JSON (ตรวจสอบสิทธิ์ Deploy Web App เป็น "ทุกคน/Anyone")');
            }

            if (parsed && parsed.__apiOk === true) {
              if (typeof successHandler === 'function') {
                successHandler(parsed.__apiResult);
              }
            } else {
              var errMsg = (parsed && parsed.__apiError) ? parsed.__apiError : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุจากเซิร์ฟเวอร์';
              throw new Error(errMsg);
            }
          })
          .catch(function(err) {
            if (typeof failureHandler === 'function') {
              failureHandler(err);
            } else {
              console.error('[GAS API Bridge Error - ' + prop + ']:', err);
            }
          });
        };
      }
    });
  }

  // สร้าง google.script.run เฉพาะเมื่อรันนอกสภาพแวดล้อม Google Apps Script (เช่น GitHub Pages)
  if (typeof window.google === 'undefined' || !window.google.script || !window.google.script.run) {
    window.google = window.google || {};
    window.google.script = window.google.script || {};
    Object.defineProperty(window.google.script, 'run', {
      get: function() {
        return createRunner(null, null);
      },
      configurable: true
    });
  }
})();
