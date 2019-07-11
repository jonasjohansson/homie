'use strict';
const { app, BrowserWindow, globalShortcut, ipcMain } = require('electron');
const { download } = require('electron-dl');
const electron = require('electron');
// const contextMenu = require('electron-context-menu');
const tray = require('./tray');
const menu = require('./menu');
const config = require('./config');

// contextMenu({
// 	prepend: (params, browserWindow) => [
// 		{
// 			label: 'Rainbow',
// 			// Only show it when right-clicking images
// 			visible: params.mediaType === 'image'
// 		}
// 	]
// });

download.directory = app.getPath('desktop');

// https://github.com/sindresorhus/electron-context-menu
// https://medium.com/missive-app/make-your-electron-app-dark-mode-compatible-c23dcfdd0dfa
// https://electronjs.org/docs/tutorial/mojave-dark-mode-guide

let win = null;
let isQuitting = false;

app.on('ready', () => {
	electron.Menu.setApplicationMenu(menu);
	createWindow();
});

app.on('window-all-closed', () => {
	app.quit();
});

app.on('activate', () => {
	win.show();
});

app.on('before-quit', () => {
	isQuitting = true;
	config.set('lastWindowState', win.getBounds());
});

const createWindow = () => {
	const lastWindowState = config.get('lastWindowState');

	win = new BrowserWindow({
		title: app.getName(),
		x: lastWindowState.x,
		y: lastWindowState.y,
		width: lastWindowState.width,
		height: lastWindowState.height,
		minWidth: 400,
		minHeight: 200,
		titleBarStyle: 'hiddenInset',
		frame: false,
		alwaysOnTop: config.get('alwaysOnTop'),
		webPreferences: {
			nodeIntegration: true,
			// https://electronjs.org/docs/api/webview-tag
			// https://electronjs.org/docs/api/browser-window
			webviewTag: true
		}
	});

	win.loadURL(`file://${__dirname}/index.html`);

	win.on('close', event => {
		if (!isQuitting) {
			event.preventDefault();
			app.hide();
		}
	});

	tray.create(win);
};

ipcMain.on('page-title-updated', (events, args) => {
	app.setBadgeCount(args);
	tray.setBadge(args);
});

ipcMain.on('quit', () => {
	app.quit();
});

ipcMain.on('debug', () => {
	win.webContents.openDevTools({ mode: 'detach' });
});
