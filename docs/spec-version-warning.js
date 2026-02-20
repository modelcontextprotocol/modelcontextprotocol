// Spec Version Warning Banner
// This script automatically displays a warning banner on older spec versions and draft pages.
//
// Note: Mintlify automatically loads all .js and .css files in the docs directory.
//
// To update when a new spec version is published:
// 1. Update LATEST_VERSION to the new version date (e.g., "2025-09-30")
// 2. Commit the change - the warnings will automatically update across all pages
//
const LATEST_VERSION = "2025-06-18";
const DRAFT_VERSION = "draft";

const SPEC_VERSION_REGEX = /\/specification\/([\w-]+)\//;

function getSpecVersion() {
  const match = window.location.pathname.match(SPEC_VERSION_REGEX);
  return match ? match[1] : null;
}

function createWarningBanner(message, linkHref, linkText, isDraft = false) {
  const banner = document.createElement('div');
  banner.className = isDraft ? 'spec-version-warning spec-version-warning-draft' : 'spec-version-warning spec-version-warning-old';
  banner.setAttribute('role', 'alert');

  const icon = document.createElement('span');
  icon.className = 'spec-version-warning-icon';
  icon.textContent = '⚠️';

  const content = document.createElement('div');
  content.className = 'spec-version-warning-content';

  const text = document.createElement('span');
  text.textContent = message + ' ';

  const link = document.createElement('a');
  link.href = linkHref;
  link.textContent = linkText;
  link.className = 'spec-version-warning-link';

  content.appendChild(text);
  content.appendChild(link);

  banner.appendChild(icon);
  banner.appendChild(content);

  return banner;
}

function insertWarningBanner() {
  const version = getSpecVersion();

  // Version will be null if we're not on a specification page.
  if (!version || version === LATEST_VERSION) {
    return;
  }

  const contentArea = document.querySelector('#content-area, main, article, .content');
  if (!contentArea) {
    console.warn('Could not find content area to insert version warning');
    return;
  }

  // Don't insert if banner already exists
  if (document.querySelector('.spec-version-warning')) {
    return;
  }

  let banner;

  if (version === DRAFT_VERSION) {
    banner = createWarningBanner(
      'Warning: You are viewing a draft of a not-yet-finalised specification.',
      `/specification/${LATEST_VERSION}`,
      `View the latest version (${LATEST_VERSION})`,
      true
    );
  } else {
    banner = createWarningBanner(
      `Warning: You are viewing an older version (${version}) of the specification.`,
      `/specification/${LATEST_VERSION}`,
      `View the latest version (${LATEST_VERSION})`,
      false
    );
  }

  contentArea.insertBefore(banner, contentArea.firstChild);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', insertWarningBanner);
} else {
  insertWarningBanner();
}

const observer = new MutationObserver(() => {
  const existingWarning = document.querySelector('.spec-version-warning');
  if (!existingWarning && getSpecVersion()) {
    insertWarningBanner();
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});