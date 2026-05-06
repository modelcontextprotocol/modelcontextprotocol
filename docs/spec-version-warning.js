// Spec Version Warning Banner
// Displays a warning banner on older spec versions and draft pages.
//
// Mintlify automatically loads all .js files in the docs directory,
// and it maintains a /specification/latest/* redirect that always points
// to the current latest version. We use that redirect as the source of
// truth, so this script requires no updates when a new spec version is
// published. Styling re-uses Mintlify's native callout classes.

const DRAFT_VERSION = "draft";
const LATEST_ALIAS_PATH = "/specification/latest";
const SPEC_PATH_REGEX = /\/specification\/([\w-]+)(\/.*)?$/;
const BANNER_ATTR = "data-spec-version-banner";

const CALLOUT_CLASS_WARNING =
  "callout my-4 px-5 py-4 overflow-hidden rounded-2xl flex gap-3 " +
  "border border-yellow-200 bg-yellow-50 " +
  "dark:border-yellow-900 dark:bg-yellow-600/20 " +
  "[&_[data-component-part='callout-icon']]:mt-px";
const CALLOUT_CLASS_INFO =
  "callout my-4 px-5 py-4 overflow-hidden rounded-2xl flex gap-3 " +
  "border border-neutral-200 bg-neutral-50 " +
  "dark:border-neutral-700 dark:bg-white/10";
const CONTENT_CLASS_BASE =
  "text-sm prose dark:prose-invert min-w-0 w-full " +
  "[&_a]:!text-current [&_a]:border-current [&_strong]:!text-current ";
const CONTENT_CLASS_WARNING =
  CONTENT_CLASS_BASE + "text-yellow-800 dark:text-yellow-300";
const CONTENT_CLASS_INFO =
  CONTENT_CLASS_BASE + "text-neutral-800 dark:text-neutral-300";
const ICON_WRAPPER_CLASS = "mt-0.5 w-4";

const ICON_SVG_WARNING =
  '<svg class="flex-none size-5 text-yellow-800 dark:text-yellow-300" ' +
  'fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" ' +
  'aria-label="Warning">' +
  '<path stroke-linecap="round" stroke-linejoin="round" ' +
  'd="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 ' +
  "4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" +
  '"></path></svg>';
const ICON_SVG_INFO =
  '<svg class="flex-none size-5 text-neutral-800 dark:text-neutral-300" ' +
  'viewBox="0 0 20 20" fill="currentColor" aria-label="Info">' +
  '<path d="M8 0C3.58125 0 0 3.58125 0 8C0 12.4187 3.58125 16 8 ' +
  "16C12.4187 16 16 12.4187 16 8C16 3.58125 12.4187 0 8 0ZM8 14.5C4.41563 " +
  "14.5 1.5 11.5841 1.5 8C1.5 4.41594 4.41563 1.5 8 1.5C11.5844 1.5 14.5 " +
  "4.41594 14.5 8C14.5 11.5841 11.5844 14.5 8 14.5ZM9.25 10.5H8.75V7.75C8.75 " +
  "7.3375 8.41563 7 8 7H7C6.5875 7 6.25 7.3375 6.25 7.75C6.25 8.1625 6.5875 " +
  "8.5 7 8.5H7.25V10.5H6.75C6.3375 10.5 6 10.8375 6 11.25C6 11.6625 6.3375 " +
  "12 6.75 12H9.25C9.66406 12 10 11.6641 10 11.25C10 10.8359 9.66563 10.5 " +
  "9.25 10.5ZM8 6C8.55219 6 9 5.55219 9 5C9 4.44781 8.55219 4 8 4C7.44781 " +
  '4 7 4.44687 7 5C7 5.55313 7.44687 6 8 6Z"></path></svg>';

function parseSpecPath(pathname) {
  const match = pathname.match(SPEC_PATH_REGEX);
  if (!match) return null;
  return { version: match[1], subPath: match[2] || "" };
}

async function resolveLatestVersion() {
  const cached = sessionStorage.getItem("mcp-latest-spec-version");
  if (cached) return cached;

  const response = await fetch(LATEST_ALIAS_PATH, { method: "HEAD" });
  const resolved = parseSpecPath(new URL(response.url).pathname);
  const version = resolved ? resolved.version : null;

  if (version && version !== "latest") {
    sessionStorage.setItem("mcp-latest-spec-version", version);
  }
  return version;
}

function createBanner(message, linkHref, linkText, isDraft) {
  const banner = document.createElement("div");
  banner.className = isDraft ? CALLOUT_CLASS_INFO : CALLOUT_CLASS_WARNING;
  banner.setAttribute("role", "alert");
  banner.setAttribute(BANNER_ATTR, "");
  banner.setAttribute("data-callout-type", isDraft ? "info" : "warning");

  const iconWrapper = document.createElement("div");
  iconWrapper.className = ICON_WRAPPER_CLASS;
  iconWrapper.setAttribute("data-component-part", "callout-icon");
  iconWrapper.innerHTML = isDraft ? ICON_SVG_INFO : ICON_SVG_WARNING;

  const content = document.createElement("div");
  content.className = isDraft ? CONTENT_CLASS_INFO : CONTENT_CLASS_WARNING;
  content.setAttribute("data-component-part", "callout-content");

  const text = document.createElement("span");
  text.textContent = message + " ";

  const link = document.createElement("a");
  link.href = linkHref;
  link.textContent = linkText;

  content.appendChild(text);
  content.appendChild(link);
  banner.appendChild(iconWrapper);
  banner.appendChild(content);

  return banner;
}

let inserting = false;

async function insertWarningBanner() {
  if (inserting) return;
  if (document.querySelector(`[${BANNER_ATTR}]`)) return;

  const current = parseSpecPath(window.location.pathname);
  if (!current) return;

  inserting = true;
  try {
    const latest = await resolveLatestVersion().catch(() => null);
    if (!latest || current.version === latest) return;

    // Re-check after the await — a concurrent call may have already
    // inserted a banner, or SPA navigation may have changed the page.
    if (document.querySelector(`[${BANNER_ATTR}]`)) return;
    if (parseSpecPath(window.location.pathname)?.version !== current.version)
      return;

    const contentArea = document.querySelector(
      "#content-area, main, article, .content",
    );
    if (!contentArea) return;

    // Mintlify redirects /specification/latest/<sub-path> to the actual
    // version, so users land on the equivalent page in the latest spec.
    const latestHref = LATEST_ALIAS_PATH + current.subPath;
    const linkText = `View the latest version (${latest})`;

    const isDraft = current.version === DRAFT_VERSION;
    const message = isDraft
      ? "You are viewing a draft of a not-yet-finalized specification."
      : `You are viewing an older version (${current.version}) of the specification.`;

    const banner = createBanner(message, latestHref, linkText, isDraft);

    // Place the banner just below the page title block. Mintlify wraps
    // the H1 in <header id="header">; fall back to a raw <h1> or the
    // top of the content area.
    const header =
      contentArea.querySelector("header#header") ||
      contentArea.querySelector("h1");
    if (header) {
      header.insertAdjacentElement("afterend", banner);
    } else {
      contentArea.insertBefore(banner, contentArea.firstChild);
    }
  } finally {
    inserting = false;
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", insertWarningBanner);
} else {
  insertWarningBanner();
}

// Re-insert after SPA navigation.
const observer = new MutationObserver(() => {
  if (
    !document.querySelector(`[${BANNER_ATTR}]`) &&
    parseSpecPath(window.location.pathname)
  ) {
    insertWarningBanner();
  }
});
observer.observe(document.body, { childList: true, subtree: true });
