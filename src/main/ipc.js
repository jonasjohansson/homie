import { ipcMain } from 'electron';
import config from './config.js';
import { switchTo } from './views.js';

export function registerIPC() {
	ipcMain.handle('get-bookmarks', () => {
		return config.get('bookmarks');
	});

	ipcMain.handle('switch-tab', (_event, index) => {
		switchTo(index);
	});
}
