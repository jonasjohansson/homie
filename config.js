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
		darkMode: false,
		// portrait: true,
		showUnreadBadge: true,
		showHidden: false,
		alwaysOnTop: false,
		bookmarks: [
			{
				url: 'https://messenger.com/',
				isHidden: false
				// isMuted: false,
				// icon: ''
			},
			{
				url: 'https://gmail.com/',
				isHidden: false
				// isMuted: false,
				// icon: ''
			},
			{
				url: 'https://calendar.google.com/',
				isHidden: false
				// isMuted: false,
				// icon: ''
			},
			{
				url: 'https://drive.google.com/drive/',
				isHidden: false
				// isMuted: false,
				// icon: ''
			},
			{
				url: 'https://docs.google.com/',
				isHidden: false
				// isMuted: false,
				// icon: ''
			},
			{
				url: 'https://spreadsheets.google.com/',
				isHidden: false
				// isMuted: false,
				// icon: ''
			},
			{
				url: 'https://contacts.google.com/',
				isHidden: false
				// isMuted: false,
				// icon: ''
			},
			{
				url: 'https://trello.com/',
				isHidden: false
				// isMuted: false,
				// icon: ''
			},
			{
				url: 'https://slack.com/',
				isHidden: false
				// isMuted: false,
				// icon: ''
			},
			{
				url: 'https://monday.com/',
				isHidden: false
				// isMuted: false,
				// icon: ''
			}
		]
	}
});
