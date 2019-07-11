'use strict';
const electron = require('electron');
const path = require('path');
const config = require('./config');
const lookup = require('./lookup');
const openAboutWindow = require('electron-about-window').default;

const { app, BrowserWindow, shell } = electron;
const appName = app.getName();

function sendAction(action, arg = null) {
	// setTimeout(() => {
	const win = BrowserWindow.getAllWindows()[0];
	// if (win === null) return;
	win.webContents.send(action, arg);
	// });
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
					titleBarStyle: 'hidden'
					// parent: BrowserWindow.getFocusedWindow(),
					// modal: true,
				},
				// show_close_button: 'Close',
				package_json_dir: __dirname
			})
	},
	{ type: 'separator' },
	{
		label: 'Preferences…',
		accelerator: 'Cmd+,',
		click() {
			config.openInEditor();
		}
	},
	{
		label: 'Icons…',
		click() {
			lookup.openInEditor();
		}
	},
	// {
	// 	label: 'Toggle Hidden',
	// 	accelerator: 'CommandOrControl+Shift+H',
	// 	click() {
	// 		sendAction('toggleHidden');
	// 	}
	// },
	{ type: 'separator' },
	{ role: 'hide' },
	{ role: 'hideothers' },
	{ role: 'unhide' },
	{ type: 'separator' },
	{ role: 'quit' }
];

const bookmarkMenu = [
	{
		label: 'Reload',
		accelerator: 'CommandOrControl+R',
		click() {
			sendAction('reload');
		}
	},
	{
		label: 'Reload All',
		accelerator: 'CommandOrControl+Shift+R',
		click() {
			sendAction('reloadAll');
		}
	},
	{
		label: 'Back',
		accelerator: 'CommandOrControl+LeftArrow',
		click() {
			sendAction('back');
		}
	},
	{
		label: 'Forward',
		accelerator: 'CommandOrControl+RightArrow',
		click() {
			sendAction('forward');
		}
	},
	{ type: 'separator' }
];

var step = 0;
for (const bookmarkData of config.get('bookmarks')) {
	let i = ++step;
	bookmarkMenu.push({
		label: bookmarkData.url,
		accelerator: `CommandOrControl+${i}`,
		click() {
			sendAction('showBookmark', i - 1);
		}
	});
}

const windowMenu = [{ role: 'minimize' }, { role: 'close' }];

const helpMenu = [
	{
		label: 'Website',
		click() {
			shell.openExternal('https://jonasjohansson.se');
		}
	},
	{
		label: 'Source Code',
		click() {
			shell.openExternal('https://github.com/jonasjohansson/homie');
		}
	},
	{ type: 'separator' },
	{ role: 'toggledevtools' },
	{
		label: 'Reset',
		click() {
			config.clear();
			lookup.clear();
		}
	}
];

const menu = [
	{
		label: appName,
		submenu: appMenu
	},
	{
		role: 'editMenu'
	},
	{
		label: 'Bookmark',
		submenu: bookmarkMenu
	},
	{
		role: 'window',
		submenu: windowMenu
	},
	{
		role: 'help',
		submenu: helpMenu
	}
];

module.exports = electron.Menu.buildFromTemplate(menu);
