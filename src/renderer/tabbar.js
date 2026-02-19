const tabsContainer = document.getElementById('tabs');

function hostnameLabel(url) {
	try {
		const host = new URL(url).hostname;
		// Strip www. and .com/.org/etc for a cleaner label
		return host.replace(/^www\./, '').replace(/\.(com|org|net|io|app|dev)$/, '');
	} catch {
		return url;
	}
}

async function init() {
	const bookmarks = await window.homie.getBookmarks();

	bookmarks.forEach((bookmark, index) => {
		const tab = document.createElement('div');
		tab.className = 'tab';
		tab.dataset.index = index;

		const label = document.createElement('span');
		label.textContent = hostnameLabel(bookmark.url);
		tab.appendChild(label);

		const dot = document.createElement('span');
		dot.className = 'dot';
		tab.appendChild(dot);

		tab.addEventListener('click', () => {
			window.homie.switchTab(index);
		});

		tabsContainer.appendChild(tab);
	});

	// Mark first tab as active
	setActive(0);
}

function setActive(index) {
	const tabs = tabsContainer.querySelectorAll('.tab');
	tabs.forEach((tab) => tab.classList.remove('active'));
	const target = tabsContainer.querySelector(`[data-index="${index}"]`);
	if (target) target.classList.add('active');
}

window.homie.onActiveTab((index) => {
	setActive(index);
});

window.homie.onUnread((index, hasUnread) => {
	const tab = tabsContainer.querySelector(`[data-index="${index}"]`);
	if (tab) {
		tab.classList.toggle('unread', hasUnread);
	}
});

init();
