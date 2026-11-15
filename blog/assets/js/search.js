// Search over the index in /index.json (layouts/index.json), for the dialog in
// layouts/partials/search_dialog.html, which loads this script the first time the reader reaches for search.
//
// The input keeps the focus. The arrow keys move a highlight through the results and Enter opens the
// highlighted one, so the first result is always one key away. Before anything is typed the list shows the
// newest posts.
(() => {
    const input = document.getElementById("searchInput");
    if (!input) return;
    const list = document.getElementById("searchResults");
    const status = document.getElementById("searchStatus");
    const heading = document.getElementById("searchHeading");
    const RECENT = 4;
    const LIMIT = 20;
    const EXCERPT = 160;
    let entries = [];
    let fuse;
    let failed = false;
    let active = -1;

    // The words of a query that are worth marking in a result. Fuse also matches loosely, so a result may
    // hold none of them as typed.
    function wordsOf(query) {
        return query.toLowerCase().split(/\s+/).filter((word) => word.length > 1);
    }

    // The summary if the query is in it, or else the stretch of the post's text around the first place it is.
    function excerptOf(entry, words) {
        const summary = entry.summary.toLowerCase();
        if (!words.length || words.some((word) => summary.includes(word))) return entry.summary;
        const content = entry.content.toLowerCase();
        const at = Math.min(...words.map((word) => content.indexOf(word)).filter((i) => i >= 0));
        if (at === Infinity) return entry.summary;
        let start = Math.max(0, at - EXCERPT / 3);
        if (start > 0) start = content.indexOf(" ", start) + 1;
        let end = Math.min(entry.content.length, start + EXCERPT);
        if (end < entry.content.length) end = content.lastIndexOf(" ", end);
        return (start > 0 ? "… " : "") + entry.content.slice(start, end).trim() + (end < entry.content.length ? " …" : "");
    }

    // `text` as nodes, with each of `words` in <mark>.
    function marked(text, words) {
        const fragment = document.createDocumentFragment();
        if (!words.length) {
            fragment.append(text);
            return fragment;
        }
        const pattern = new RegExp(`(${words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
        text.split(pattern).forEach((part, i) => {
            if (i % 2) {
                const mark = document.createElement("mark");
                mark.textContent = part;
                fragment.append(mark);
            } else if (part) {
                fragment.append(part);
            }
        });
        return fragment;
    }

    function rowFor(entry, words, i) {
        const row = document.createElement("li");
        row.className = "search-result";
        row.id = `search-result-${i}`;
        row.setAttribute("role", "option");
        row.setAttribute("aria-selected", "false");
        const link = document.createElement("a");
        link.href = entry.permalink;
        link.tabIndex = -1;
        const title = document.createElement("span");
        title.className = "search-result-title";
        title.append(marked(entry.title, words));
        const text = document.createElement("span");
        text.className = "search-result-text";
        if (entry.date) {
            const date = document.createElement("time");
            date.textContent = entry.date;
            text.append(date);
        }
        text.append(marked(excerptOf(entry, words), words));
        link.append(title, text);
        row.append(link);
        return row;
    }

    function setActive(i, scroll) {
        active = i;
        [...list.children].forEach((row, at) => {
            row.classList.toggle("active", at === i);
            row.setAttribute("aria-selected", String(at === i));
        });
        if (i < 0) {
            input.removeAttribute("aria-activedescendant");
            return;
        }
        input.setAttribute("aria-activedescendant", list.children[i].id);
        if (scroll) list.children[i].scrollIntoView({ block: "nearest" });
    }

    function render() {
        const query = input.value.trim();
        const words = wordsOf(query);
        let shown = [];
        if (fuse) shown = query ? fuse.search(query, { limit: LIMIT }).map((match) => match.item) : entries.slice(0, RECENT);
        list.replaceChildren(...shown.map((entry, i) => rowFor(entry, words, i)));
        list.scrollTop = 0;
        heading.hidden = Boolean(query) || !shown.length;
        input.setAttribute("aria-expanded", String(shown.length > 0));
        if (failed) status.textContent = "Search is unavailable. Please try again later.";
        else status.textContent = query && fuse && !shown.length ? `No posts match “${query}”.` : "";
        setActive(query && shown.length ? 0 : -1);
    }

    input.addEventListener("input", render);

    input.addEventListener("keydown", (event) => {
        const last = list.children.length - 1;
        if (event.key === "ArrowDown" && last >= 0) {
            event.preventDefault();
            setActive(Math.min(active + 1, last), true);
        } else if (event.key === "ArrowUp" && last >= 0) {
            event.preventDefault();
            setActive(Math.max(active - 1, 0), true);
        } else if (event.key === "Enter" && active >= 0) {
            event.preventDefault();
            const { href } = list.children[active].querySelector("a");
            if (event.metaKey || event.ctrlKey) window.open(href, "_blank", "noopener");
            else window.location.assign(href);
        }
    });

    // The pointer moves the same highlight as the arrow keys, so there is only ever one.
    list.addEventListener("pointermove", (event) => {
        const row = event.target.closest(".search-result");
        const at = [...list.children].indexOf(row);
        if (at >= 0 && at !== active) setActive(at);
    });

    // A click on a result must not take the focus, and with it the keyboard, out of the input.
    list.addEventListener("mousedown", (event) => event.preventDefault());

    fetch(input.dataset.index)
        .then((response) => {
            if (!response.ok) throw new Error("Search index unavailable");
            return response.json();
        })
        .then((loaded) => {
            entries = loaded;
            fuse = new Fuse(entries, {
                threshold: 0.3,
                ignoreLocation: true,
                minMatchCharLength: 2,
                keys: [
                    { name: "title", weight: 3 },
                    { name: "tags", weight: 2 },
                    { name: "summary", weight: 2 },
                    { name: "content", weight: 1 },
                ],
            });
        })
        .catch(() => {
            failed = true;
        })
        .finally(render);
})();
