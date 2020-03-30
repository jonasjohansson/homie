'use strict';
const Store = require('electron-store');

module.exports = new Store({
  defaults: {
    lastWindowState: {
      x: 0,
      y: 0,
      width: 800,
      height: 600
    },
    // showUnreadBadge: true,
    // badgeIcon: '',
    darkMode: false,
    showHidden: false,
    alwaysOnTop: false,
    bookmarks: [
      {
        url: 'https://messenger.com/',
        isMuted: true
      },
      {
        url: 'https://gmail.com/'
      },
      {
        url: 'https://calendar.google.com/'
      },
      {
        url: 'https://drive.google.com/drive/'
      },
      {
        url: 'https://docs.google.com/'
      },
      {
        url: 'https://spreadsheets.google.com/'
      },
      {
        url: 'https://trello.com/'
      },
      {
        url: 'https://web.whatsapp.com/'
      },
      {
        url: 'https://discordapp.com/channels/@me',
        isMuted: true,
        isDark: true
      }
    ]
  }
});
