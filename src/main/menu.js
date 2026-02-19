import { app, Menu, shell } from 'electron';
import config from './config.js';
import {
	switchTo,
	reload,
	reloadAll,
	goBack,
	goForward,
	zoomIn,
	zoomOut,
	resetZoom,
	saveCurrent,
	saveAll,
} from './views.js';

export function createMenu() {
	const bookmarks = config.get('bookmarks');

	const bookmarkItems = bookmarks.map((bookmark, i) => {
		const acc =
			i < 9
				? `CommandOrControl+${i + 1}`
				: `CommandOrControl+Option+${i - 9}`;
		return {
			label: bookmark.url,
			accelerator: acc,
			click: () => switchTo(i),
		};
	});

	const template = [
		{
			label: app.name,
			submenu: [
				{
					label: 'About Homie',
					click: () => app.showAboutPanel(),
				},
				{ type: 'separator' },
				{
					label: 'Preferences\u2026',
					accelerator: 'Cmd+,',
					click: () => config.openInEditor(),
				},
				{ type: 'separator' },
				{ role: 'hide' },
				{ role: 'hideOthers' },
				{ role: 'unhide' },
				{ type: 'separator' },
				{ role: 'quit' },
			],
		},
		{
			role: 'editMenu',
		},
		{
			label: 'Bookmark',
			submenu: [
				{
					label: 'Reload',
					accelerator: 'Cmd+R',
					click: () => reload(),
				},
				{
					label: 'Reload All',
					accelerator: 'Cmd+Shift+R',
					click: () => reloadAll(),
				},
				{
					label: 'Back',
					accelerator: 'Cmd+Shift+Left',
					click: () => goBack(),
				},
				{
					label: 'Forward',
					accelerator: 'Cmd+Shift+Right',
					click: () => goForward(),
				},
				{
					label: 'Save',
					accelerator: 'Cmd+S',
					click: () => saveCurrent(),
				},
				{
					label: 'Save All',
					accelerator: 'Cmd+Shift+S',
					click: () => saveAll(),
				},
				{ type: 'separator' },
				{
					label: 'Reset Zoom',
					click: () => resetZoom(),
				},
				{
					label: 'Zoom In',
					accelerator: 'Cmd+Shift+=',
					click: () => zoomIn(),
				},
				{
					label: 'Zoom Out',
					accelerator: 'Cmd+Shift+-',
					click: () => zoomOut(),
				},
				{ type: 'separator' },
				...bookmarkItems,
			],
		},
		{
			role: 'windowMenu',
		},
		{
			role: 'help',
			submenu: [
				{
					label: 'Website',
					click: () => shell.openExternal('https://jonasjohansson.se'),
				},
				{
					label: 'Source Code',
					click: () =>
						shell.openExternal('https://github.com/jonasjohansson/homie'),
				},
				{ type: 'separator' },
				{
					label: 'Reset',
					click: () => config.clear(),
				},
			],
		},
	];

	Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
