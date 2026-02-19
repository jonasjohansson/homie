import { app, BrowserWindow, WebContentsView } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import contextMenu from 'electron-context-menu';
import config from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TAB_BAR_HEIGHT = 38;

let win = null;
let tabBarView = null;
let contentViews = [];
let activeIndex = -1;
let unreadIndex = 0;
let unreadState = [];

export function getWindow() {
	return win;
}

export function getActiveIndex() {
	return activeIndex;
}

export function getActiveView() {
	return contentViews[activeIndex] ?? null;
}

export function getAllViews() {
	return contentViews;
}

export function getUnreadIndex() {
	return unreadIndex;
}

export function createWindow() {
	const lastWindowState = config.get('lastWindowState');

	win = new BrowserWindow({
		title: app.name,
		x: lastWindowState.x,
		y: lastWindowState.y,
		width: lastWindowState.width,
		height: lastWindowState.height,
		minWidth: 400,
		minHeight: 200,
		titleBarStyle: 'hiddenInset',
		windowButtonPosition: { x: 12, y: 10 },
		vibrancy: 'sidebar',
		show: false,
	});

	// Tab bar view
	tabBarView = new WebContentsView({
		webPreferences: {
			preload: path.join(__dirname, '..', 'preload', 'preload-tabbar.js'),
			contextIsolation: true,
			sandbox: true,
			nodeIntegration: false,
		},
	});
	win.contentView.addChildView(tabBarView);
	tabBarView.webContents.loadFile(
		path.join(__dirname, '..', 'renderer', 'tabbar.html')
	);

	// Create content views for each bookmark
	const bookmarks = config.get('bookmarks');
	unreadState = new Array(bookmarks.length).fill(false);

	bookmarks.forEach((bookmark, index) => {
		const view = new WebContentsView({
			webPreferences: {
				preload: path.join(__dirname, '..', 'preload', 'preload-webview.js'),
				contextIsolation: true,
				sandbox: true,
				nodeIntegration: false,
			},
		});

		view.webContents.loadURL(bookmark.url);

		if (bookmark.isMuted) {
			view.webContents.setAudioMuted(true);
		}

		contextMenu({ window: view });

		view.webContents.on('page-title-updated', () => {
			const title = view.webContents.getTitle();
			const url = view.webContents.getURL();

			if (url.includes('messenger') && !title.includes('Messenger')) {
				return;
			}

			let messageCount = /\(([0-9]+)\)/.exec(title);
			messageCount = messageCount ? Number(messageCount[1]) : 0;

			if (title.includes('Slack')) {
				messageCount = title.indexOf('*') > -1 ? 1 : 0;
			}

			if (messageCount > 0) {
				unreadIndex = index;
			}

			const hasUnread = messageCount > 0;
			unreadState[index] = hasUnread;

			app.setBadgeCount(messageCount);

			// Notify tab bar of unread state
			if (tabBarView && !tabBarView.webContents.isDestroyed()) {
				tabBarView.webContents.send('unread-update', index, hasUnread);
			}

			// Notify tray (imported lazily to avoid circular deps)
			import('./tray.js').then((tray) => tray.setBadge(messageCount > 0));
		});

		contentViews.push(view);
	});

	// Layout on resize
	win.on('resize', layoutViews);
	layoutViews();

	// Show first bookmark
	switchTo(0);
	win.show();
}

function layoutViews() {
	if (!win) return;
	const { width, height } = win.getContentBounds();

	tabBarView.setBounds({
		x: 0,
		y: 0,
		width,
		height: TAB_BAR_HEIGHT,
	});

	// Resize active content view
	if (activeIndex >= 0 && contentViews[activeIndex]) {
		contentViews[activeIndex].setBounds({
			x: 0,
			y: TAB_BAR_HEIGHT,
			width,
			height: height - TAB_BAR_HEIGHT,
		});
	}
}

export function switchTo(index) {
	if (index < 0 || index >= contentViews.length) return;

	// Remove previous content view
	if (activeIndex >= 0 && contentViews[activeIndex]) {
		win.contentView.removeChildView(contentViews[activeIndex]);
	}

	activeIndex = index;

	// Add new content view
	win.contentView.addChildView(contentViews[index]);
	layoutViews();

	// Notify tab bar
	if (tabBarView && !tabBarView.webContents.isDestroyed()) {
		tabBarView.webContents.send('active-tab', index);
	}
}

export function reload() {
	const view = getActiveView();
	if (view) view.webContents.reload();
}

export function reloadAll() {
	for (const view of contentViews) {
		view.webContents.reload();
	}
}

export function goBack() {
	const view = getActiveView();
	if (view && view.webContents.canGoBack()) {
		view.webContents.goBack();
	}
}

export function goForward() {
	const view = getActiveView();
	if (view && view.webContents.canGoForward()) {
		view.webContents.goForward();
	}
}

export function zoomIn() {
	const view = getActiveView();
	if (view) {
		view.webContents.setZoomLevel(view.webContents.getZoomLevel() + 0.5);
	}
}

export function zoomOut() {
	const view = getActiveView();
	if (view) {
		view.webContents.setZoomLevel(view.webContents.getZoomLevel() - 0.5);
	}
}

export function resetZoom() {
	const view = getActiveView();
	if (view) {
		view.webContents.setZoomLevel(0);
	}
}

export function saveCurrent() {
	const index = getActiveIndex();
	if (index < 0) return;
	const bookmarks = config.get('bookmarks');
	bookmarks[index].url = contentViews[index].webContents.getURL();
	config.set('bookmarks', bookmarks);
}

export function saveAll() {
	const bookmarks = config.get('bookmarks');
	contentViews.forEach((view, i) => {
		bookmarks[i].url = view.webContents.getURL();
	});
	config.set('bookmarks', bookmarks);
}
