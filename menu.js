'use strict';
const { ipcMain } = require('electron');
const electron = require('electron');
const config = require('./config');
const lookup = require('./lookup');
const openAboutWindow = require('electron-about-window').default;

const { app, BrowserWindow, shell } = electron;
const appName = app.name;

let oldWin;

function sendAction(action, arg = null) {
	app.emit(action, arg);
}

const appMenu = [
	{
		label: 'About Homie',
		click: () =>
			openAboutWindow({
				icon_path: `${__dirname}/assets/icon.png`,
				copyright: `Copyright (c) ${new Date().getFullYear()} Jonas Johansson`,
				homepage: 'https://jonasjohansson.itch.io/homie',
				win_options: {
					titleBarStyle: 'hidden',
					// parent: BrowserWindow.getFocusedWindow(),
					// modal: true,
				},
				// show_close_button: 'Close',
				package_json_dir: __dirname,
			}),
	},
	{ type: 'separator' },
	{
		label: 'Preferences…',
		accelerator: 'Cmd+,',
		click() {
			config.openInEditor();
		},
	},
	{
		label: 'Icons…',
		click() {
			lookup.openInEditor();
		},
	},
	{ type: 'separator' },
	{
		label: 'Toggle Nav',
		accelerator: 'Cmd+Shift+N',
		click() {
			sendAction('toggleNav');
		},
	},
	{ type: 'separator' },
	{ role: 'hide' },
	{ role: 'hideothers' },
	{ role: 'unhide' },
	{ type: 'separator' },
	{ role: 'quit' },
];

const bookmarkMenu = [
	{
		label: 'Reload',
		accelerator: 'Cmd+R',
		click() {
			sendAction('reload');
		},
	},
	{
		label: 'Reload All',
		accelerator: 'Cmd+Shift+R',
		click() {
			sendAction('reloadAll');
		},
	},
	{
		label: 'Back',
		// accelerator: 'Cmd+Left',
		click() {
			sendAction('back');
		},
	},
	{
		label: 'Forward',
		// accelerator: 'Cmd+Right',
		click() {
			sendAction('forward');
		},
	},
	{
		label: 'Save',
		accelerator: 'Cmd+S',
		click() {
			sendAction('save');
		},
	},
	{ type: 'separator' },
	{
		label: 'Reset Zoom',
		click() {
			sendAction('reset-zoom');
		},
	},
	{
		label: 'Zoom In',
		accelerator: 'Cmd++',
		click() {
			sendAction('zoom-in');
		},
	},
	{
		label: 'Zoom Out',
		accelerator: 'Cmd+-',
		click() {
			sendAction('zoom-out');
		},
	},
	{ type: 'separator' },
];

let bookmarkCounter = 0;
for (const bookmarkData of config.get('bookmarks')) {
	const acc =
		bookmarkCounter < 9
			? `CommandOrControl+${bookmarkCounter + 1}`
			: `CommandOrControl+Option+${bookmarkCounter - 9}`;
	const i = bookmarkCounter;
	bookmarkMenu.push({
		label: bookmarkData.url,
		accelerator: acc,
		click() {
			sendAction('showBookmark', i);
		},
	});
	bookmarkCounter++;
}

const windowMenu = [{ role: 'minimize' }, { role: 'close' }];

const helpMenu = [
	{
		label: 'Website',
		click() {
			shell.openExternal('https://jonasjohansson.se');
		},
	},
	{
		label: 'Source Code',
		click() {
			shell.openExternal('https://github.com/jonasjohansson/homie');
		},
	},
	{ type: 'separator' },
	{ role: 'toggledevtools' },
	{
		label: 'Reset',
		click() {
			config.clear();
			lookup.clear();
		},
	},
];

const menu = [
	{
		label: appName,
		submenu: appMenu,
	},
	{
		role: 'editMenu',
	},
	{
		label: 'Bookmark',
		submenu: bookmarkMenu,
	},
	{
		role: 'window',
		submenu: windowMenu,
	},
	{
		role: 'help',
		submenu: helpMenu,
	},
];

module.exports = electron.Menu.buildFromTemplate(menu);
