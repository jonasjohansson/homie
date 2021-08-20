'use strict';
const electron = require('electron');
const { app, BrowserWindow, BrowserView, ipcMain } = require('electron');
const { download } = require('electron-dl');
const tray = require('./tray');
const menu = require('./menu');
const config = require('./config');
const contextMenu = require('electron-context-menu');

download.directory = app.getPath('desktop');

let win;
app.disableHardwareAcceleration();
let views = [];
let prevView = null;
let currView = null;
let currViewIndex = null;
let unreadIndex = 0;
let onlineChecker;
let isOnline = null;

const filePath = `file://${__dirname}`;
const appUrl = `${filePath}/index.html`;
const offlineUrl = `${filePath}/offline.html`;

(async () => {
	await app.whenReady();
	electron.Menu.setApplicationMenu(menu);
	createWindow();

	function init() {
		win.loadURL(appUrl, { userAgent: config.get('useragent') });
		app.userAgentFallback = config.get('useragent');
		tray.create(win);
		createViews();
		showBookmark(0);
		win.on('trayClick', function () {
			showBookmark(unreadIndex);
		});
		win.on('resize', setAllBounds);
		win.show();
	}

	onlineChecker = setInterval(function () {
		dns.resolve('www.google.com', function (err, addr) {
			if (err) {
				if (isOnline === null) {
					win.loadURL(offlineUrl);
					// console.log('No Internet connection!');
					isOnline = false;
				}
			} else {
				clearInterval(onlineChecker);
				init();
			}
		});
	}, 1000);
})();

const createWindow = async () => {
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
		paintWhenInitiallyHidden: false,
		webPreferences: {
			spellcheck: true,
		},
	});
};

const createViews = () => {
	config.get('bookmarks').forEach((bookmarkData, bookmarkIndex) => {
		const view = new BrowserView();
		win.addBrowserView(view);
		view.setAutoResize({
			width: true,
			height: false,
			horizontal: true,
			vertical: true,
		});
		setBounds(view);
		view.webContents.loadURL(bookmarkData.url);
		view.webContents.setAudioMuted(bookmarkData.isMuted);
		console.log(view.webContents.isAudioMuted());
		view.webContents.userAgent = config.get('useragent');
		view.webContents.on('did-finish-load', () => {
			contextMenu({
				window: view,
				labels: {
					cut: 'Cut',
					copy: 'Copy',
					paste: 'Paste',
					save: 'Save Image',
					saveImageAs: 'Save Image As…',
					copyLink: 'Copy Link',
					saveLinkAs: 'Save Link As…',
				},
				showCopyImageAddress: true,
				showSaveImageAs: true,
				showSaveLinkAs: true,
				cut: true,
				copy: true,
				paste: true,
				save: true,
				saveImageAs: true,
				copyLink: true,
				saveLinkAs: true,
			});
		});

		view.webContents.on('page-title-updated', (event, args) => {
			const title = view.webContents.getTitle();
			const url = view.webContents.getURL();

			if (url.includes('messenger') && !title.includes('Messenger')) {
				return;
			}

			let messageCount = /\(([0-9]+)\)/.exec(title);
			messageCount = messageCount ? Number(messageCount[1]) : 0;

			if (title.includes('Slack'))
				messageCount = title.indexOf('*') > -1 ? 1 : 0;

			if (messageCount === 1) {
				unreadIndex = bookmarkIndex;
			}

			pageTitleUpdated(messageCount);
		});

		views.push(view);
		win.removeBrowserView(view);
	});
};

const setAllBounds = () => {
	for (let view of views) setBounds(view);
};

const setBounds = (view) => {
	view.setBounds({
		x: 0,
		y: 0,
		width: win.getBounds().width,
		height: win.getBounds().height,
	});
};

// https://www.electronjs.org/docs/api/app#appbadgecount-linux-macos
const pageTitleUpdated = (messageCount) => {
	app.setBadgeCount(messageCount);
	tray.setBadge(messageCount);
};

const showBookmark = (index) => {
	currView = views[index];
	currViewIndex = index;
	if (prevView !== null) win.removeBrowserView(prevView);
	win.addBrowserView(currView);
	// if (currView !== prevView) win.setTopBrowserView(currView);
	setBounds(currView);
	prevView = currView;
};

const dns = require('dns');
let isConnected = false;

app.setAsDefaultProtocolClient('homie');

app.on('window-all-closed', () => {
	app.quit();
});

app.on('before-quit', () => {
	config.set('lastWindowState', win.getBounds());
});

app.on('showBookmark', (index) => {
	showBookmark(index);
});

app.on('reload', () => {
	currView.webContents.reload();
});

app.on('reloadAll', () => {
	for (let view of views) view.webContents.reload();
});

app.on('back', () => {
	currView.webContents.back();
});

app.on('forward', () => {
	currView.webContents.forward();
});

app.on('zoomIn', () => {
	currView.webContents.setZoomLevel(currView.webContents.getZoomLevel() + 0.5);
});

app.on('zoomOut', () => {
	currView.webContents.setZoomLevel(currView.webContents.getZoomLevel() - 0.5);
});

app.on('resetZoom', () => {
	currView.webContents.setZoomLevel(0);
});

app.on('save', () => {
	if (currViewIndex === null) return;
	const bookmarkData = config.get('bookmarks');
	bookmarkData[currViewIndex].url = currView.webContents.getURL();
	config.set('bookmarks', bookmarkData);
});

app.on('saveAll', () => {
	const bookmarkData = config.get('bookmarks');
	views.forEach((view, i) => {
		bookmarkData[i].url = view.webContents.getURL();
	});
	config.set('bookmarks', bookmarkData);
});
