'use strict';
const electron = require('electron');

let tray = null;

const trayIconDefault = `${__dirname}/assets/trayIcon.png`;
const trayIconUnread = `${__dirname}/assets/trayIconUnread.png`;

exports.create = (win) => {
	tray = new electron.Tray(trayIconDefault);
	tray.on('click', () => {
		win.show();
		win.focus();
		win.emit('trayClick');
	});
};

exports.setBadge = (shouldDisplayUnread) => {
	const icon = shouldDisplayUnread ? trayIconUnread : trayIconDefault;
	tray.setImage(icon);
};

exports.setTitle = (msg) => {
	tray.setTitle(msg);
};
