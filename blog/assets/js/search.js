const searchInput = document.getElementById("searchInput");
const searchResults = document.getElementById("searchResults");
const searchStatus = document.getElementById("searchStatus");
let searchIndex;

function renderSearchResults() {
    const query = searchInput.value.trim();
    const matches = searchIndex && query ? searchIndex.search(query, { limit: 50 }) : [];
    const fragment = document.createDocumentFragment();

    for (const { item } of matches) {
        const row = document.createElement("li");
        const link = document.createElement("a");
        link.href = item.permalink;
        link.textContent = item.title;
        row.appendChild(link);
        fragment.appendChild(row);
    }

    searchResults.replaceChildren(fragment);
    searchStatus.textContent = query && searchIndex && !matches.length ? "No results." : "";
}

searchInput.addEventListener("input", renderSearchResults);
searchInput.addEventListener("search", renderSearchResults);

document.getElementById("searchbox").addEventListener("keydown", (event) => {
    const links = Array.from(searchResults.querySelectorAll("a"));
    const position = links.indexOf(document.activeElement);

    if (event.key === "Escape") {
        searchInput.value = "";
        renderSearchResults();
        searchInput.focus();
    } else if (event.key === "ArrowDown" && links.length) {
        event.preventDefault();
        links[Math.min(position + 1, links.length - 1)].focus();
    } else if (event.key === "ArrowUp" && position >= 0) {
        event.preventDefault();
        (position === 0 ? searchInput : links[position - 1]).focus();
    } else if (event.key === "ArrowRight" && position >= 0) {
        links[position].click();
    }
});

searchResults.addEventListener("focusin", () => {
    for (const row of searchResults.children) {
        row.classList.toggle("focus", row.contains(document.activeElement));
    }
});

searchInput.addEventListener("focus", () => {
    for (const row of searchResults.children) row.classList.remove("focus");
});

fetch(searchInput.dataset.index)
    .then((response) => {
        if (!response.ok) throw new Error("Search index unavailable");
        return response.json();
    })
    .then((entries) => {
        searchIndex = new Fuse(entries, {
            threshold: 0.4,
            ignoreLocation: true,
            keys: ["title", "permalink", "summary", "content"],
        });
        renderSearchResults();
    })
    .catch(() => {
        searchStatus.textContent = "Search is unavailable. Please try again later.";
    });