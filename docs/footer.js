// Custom footer copyright notice
(function() {
  function addCopyright() {
    const footer = document.querySelector('footer');
    if (footer && !document.getElementById('lf-copyright')) {
      const copyright = document.createElement('div');
      copyright.id = 'lf-copyright';
      copyright.innerHTML = 'Copyright © Model Context Protocol a Series of LF Projects, LLC.<br>For web site terms of use, trademark policy and other project policies please see <a href="https://lfprojects.org">https://lfprojects.org</a>.';
      footer.appendChild(copyright);
    }
  }

  // Run on initial load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addCopyright);
  } else {
    addCopyright();
  }

  // Handle SPA navigation
  const observer = new MutationObserver(addCopyright);
  observer.observe(document.body, { childList: true, subtree: true });
})();
