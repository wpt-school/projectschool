/**
 * app-loader.js
 * โหลดไฟล์ HTML ย่อย (Workspace, Teacher, ExportGrade, SystemConfig) บน GitHub Pages
 * และจำลองการทำงานของ <?!= include('...'); ?> พร้อมสั่งรันสคริปต์และอีเวนต์เริ่มต้น
 */
(function() {
  var INCLUDE_REGEX = /<\?!=\s*include\(\s*['"]([^'"]+)['"]\s*\)\s*;?\s*\?>/g;

  function fetchHtmlFile(name) {
    var filename = name.toLowerCase().endsWith('.html') ? name : (name + '.html');
    return fetch('./' + filename, { cache: 'no-cache' }).then(function(res) {
      if (!res.ok) {
        throw new Error('ไม่พบไฟล์ ' + filename + ' (HTTP ' + res.status + ')');
      }
      return res.text();
    });
  }

  /**
   * ดึงไฟล์ HTML และคลี่คำสั่ง <?!= include('...'); ?> ที่ซ้อนอยู่ทั้งหมดแบบขนาน
   */
  function fetchAndResolveIncludes(name, visited) {
    visited = visited || {};
    if (visited[name]) return Promise.resolve('');
    visited[name] = true;

    return fetchHtmlFile(name).then(function(html) {
      var matches = [];
      var m;
      INCLUDE_REGEX.lastIndex = 0;
      while ((m = INCLUDE_REGEX.exec(html)) !== null) {
        matches.push({ fullMatch: m[0], targetName: m[1] });
      }

      if (matches.length === 0) return html;

      return Promise.all(matches.map(function(item) {
        return fetchAndResolveIncludes(item.targetName, Object.assign({}, visited))
          .then(function(subHtml) {
            return { fullMatch: item.fullMatch, subHtml: subHtml };
          });
      })).then(function(resolvedList) {
        var finalHtml = html;
        resolvedList.forEach(function(item) {
          finalHtml = finalHtml.split(item.fullMatch).join(item.subHtml);
        });
        return finalHtml;
      });
    });
  }

  /**
   * แทรก HTML ลงใน DOM และสร้างแท็ก <script> ใหม่เพื่อให้เบราว์เซอร์รันโค้ดจริง
   * (ข้าม <script> ที่อยู่ใน <template> ตามมาตรฐาน HTML)
   */
  function mountHtmlWithScripts(container, htmlString) {
    var temp = document.createElement('div');
    temp.innerHTML = htmlString;

    var scriptsToRun = [];
    var nodes = Array.from(temp.childNodes);

    nodes.forEach(function(node) {
      if (node.nodeType === 1 && node.tagName === 'SCRIPT') {
        scriptsToRun.push(node);
      } else {
        if (node.nodeType === 1 && node.tagName !== 'TEMPLATE') {
          var nestedScripts = node.querySelectorAll('script');
          nestedScripts.forEach(function(ns) {
            scriptsToRun.push(ns);
            if (ns.parentNode) ns.parentNode.removeChild(ns);
          });
        }
        container.appendChild(node);
      }
    });

    scriptsToRun.forEach(function(oldScript) {
      var newScript = document.createElement('script');
      Array.from(oldScript.attributes).forEach(function(attr) {
        newScript.setAttribute(attr.name, attr.value);
      });
      newScript.textContent = oldScript.textContent;
      document.body.appendChild(newScript);
    });
  }

  function initGitHubApp() {
    // ป้องกันการทำงานซ้ำเมื่อมีการ dispatchEvent('DOMContentLoaded') ให้ไฟล์ย่อย
    if (window.__appLoaderInitialized) return;
    window.__appLoaderInitialized = true;

    var wsMount = document.getElementById('workspaceMountPoint');
    var tcMount = document.getElementById('teacherMountPoint');
    var loadingOverlay = document.getElementById('appInitLoading');

    Promise.all([
      fetchAndResolveIncludes('Workspace'),
      fetchAndResolveIncludes('Teacher')
    ])
    .then(function(results) {
      var workspaceHtml = results[0];
      var teacherHtml = results[1];

      // โหลด Workspace ก่อนเพื่อให้ฟังก์ชัน escapeHtml() พร้อมใช้งานใน Teacher
      if (wsMount) mountHtmlWithScripts(wsMount, workspaceHtml);
      if (tcMount) mountHtmlWithScripts(tcMount, teacherHtml);

      // รองรับการเปิดหน้าครูโดยตรงผ่าน ?page=teacher
      var params = new URLSearchParams(window.location.search);
      if (String(params.get('page') || '').toLowerCase() === 'teacher') {
        var loginEl = document.getElementById('loginSection');
        if (loginEl && loginEl.parentNode) {
          loginEl.parentNode.removeChild(loginEl);
        }
      }

      // แจ้งอีเวนต์ DOMContentLoaded เพื่อให้สคริปต์ใน Teacher.html และ SystemConfig.html เริ่มทำงาน
      window.dispatchEvent(new Event('DOMContentLoaded'));

      if (loadingOverlay) loadingOverlay.classList.add('hidden');
    })
    .catch(function(err) {
      if (loadingOverlay) loadingOverlay.classList.add('hidden');
      if (typeof showAlert === 'function') {
        showAlert('ไม่สามารถโหลดองค์ประกอบของระบบได้: ' + err.message, 'danger');
      } else {
        alert('ไม่สามารถโหลดองค์ประกอบของระบบได้: ' + err.message);
      }
    });
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initGitHubApp);
  } else {
    initGitHubApp();
  }
})();
