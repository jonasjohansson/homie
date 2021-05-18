'use strict';
const Store = require('electron-store');

module.exports = new Store({
	defaults: {
		lastWindowState: {
			x: 0,
			y: 0,
			width: 800,
			height: 600,
		},
		// showUnreadBadge: true,
		// badgeIcon: '',
		darkMode: false,
		showHidden: false,
		alwaysOnTop: false,
		bookmarks: [
			{
				url: 'https://messenger.com/',
				isMuted: true,
			},
			{
				url: 'https://mail.google.com/mail/u/0/',
			},
			{
				url: 'https://calendar.google.com/calendar/u/0/',
			},
			{
				url: 'https://drive.google.com/drive/',
			},
			{
				url: 'https://docs.google.com/document/u/0/',
			},
			{
				url: 'https://docs.google.com/spreadsheets/u/0',
			},
			{
				url: 'https://trello.com/',
			},
			{
				url: 'https://web.whatsapp.com/',
				isMuted: true,
			},
			{
				url: 'https://discord.com/app/',
				isMuted: true,
			},
			{
				url: 'http://slack.com/',
				isMuted: true,
			},
		],
		extensions: [],
		useragent:
			'Mozilla/5.0 (Macintosh; Intel Mac OS X 11_3_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36',
	},
});
