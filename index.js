'use strict';
const { app, session, BrowserWindow, ipcMain } = require('electron');
const { download } = require('electron-dl');
const electron = require('electron');
const tray = require('./tray');
const menu = require('./menu');
const config = require('./config');
const { lstatSync, readdirSync } = require('fs');
const { join } = require('path');

download.directory = app.getPath('desktop');

let win = null;
app.disableHardwareAcceleration();
app.allowRendererProcessReuse = true;

const authUrl = `file://${__dirname}/index.html`;

app.whenReady().then(() => {
	electron.Menu.setApplicationMenu(menu);
	app.on('activate', () => {
		session.defaultSession.webRequest.onBeforeSendHeaders(
			(details, callback) => {
				details.requestHeaders['User-Agent'] = 'Chrome';
				callback({
					cancel: false,
					requestHeaders: details.requestHeaders,
				});
			}
		);
	});
	// app.userAgentFallback = 'Chrome';

	// getExtensions();
	createWindow();
	win.show();
});

app.setAsDefaultProtocolClient('homie');

app.on('window-all-closed', () => {
	app.quit();
});

app.on('before-quit', () => {
	config.set('lastWindowState', win.getBounds());
});

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
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
			enableRemoteModule: true,
			// https://electronjs.org/docs/api/webview-tag
			// https://electronjs.org/docs/api/browser-window
			webviewTag: true,
			webSecurity: true,
		},
	});

	win.loadURL(authUrl, { userAgent: 'Chrome' });

	tray.create(win);
};

// let badgeIcon = config.get('badgeIcon');

ipcMain.on('page-title-updated', (events, args) => {
	app.badgeCount = args;
	tray.setBadge(args);
	// if (badgeIcon !== '') {
	// let msg = args > 0 ? badgeIcon : '';
	// msg = "\033[" + 31 + "m" + msg + "\033[0m";
	// tray.setTitle(args.toString());
	// tray.setTitle(msg);
	// }
});

ipcMain.on('createNew', () => {
	createWindow();
});

const getExtensions = () => {
	const extensionPath =
		process.env.HOME +
		'/Library/Application Support/Google/Chrome/Default/Extensions';
	const installedExtensions = getDirectories(extensionPath);

	installedExtensions.forEach((ext) => {
		const version = getDirectories(ext);
		try {
			// BrowserWindow.addExtension(version + '/');
			BrowserWindow.loadExtension(version + '/');
		} catch (err) {
			console.error(err);
		}
	});
};

const isDirectory = (source) => lstatSync(source).isDirectory();
const getDirectories = (source) =>
	readdirSync(source)
		.map((name) => join(source, name))
		.filter(isDirectory);
