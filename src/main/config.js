import Store from 'electron-store';

const store = new Store({
	defaults: {
		lastWindowState: {
			x: 0,
			y: 0,
			width: 800,
			height: 600,
		},
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
	},
});

export default store;
