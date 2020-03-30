'use strict';
const electron = require('electron');

let tray = null;

const trayIconDefault = `${__dirname}/assets/tray/trayIcon.png`;
const trayIconUnread = `${__dirname}/assets/tray/trayIconUnread.png`;

exports.create = win => {
  tray = new electron.Tray(trayIconDefault);
  // tray.setHighlightMode('never'); https://electronjs.org/docs/api/breaking-changes#tray
  tray.on('click', () => {
    win.show();
    win.focus();
  });
};

exports.setBadge = shouldDisplayUnread => {
  const icon = shouldDisplayUnread ? trayIconUnread : trayIconDefault;
  tray.setImage(icon);
};

exports.setTitle = msg => {
  tray.setTitle(msg);
};
