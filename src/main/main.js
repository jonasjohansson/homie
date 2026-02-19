import { app, nativeTheme } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWindow, getWindow } from './views.js';
import { createMenu } from './menu.js';
import { createTray } from './tray.js';
import { registerIPC } from './ipc.js';
import config from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

nativeTheme.themeSource = 'system';

app.setAboutPanelOptions({
	applicationName: 'Homie',
	applicationVersion: app.getVersion(),
	copyright: `Copyright \u00A9 ${new Date().getFullYear()} Jonas Johansson`,
	iconPath: path.join(__dirname, '..', '..', 'build', 'icon.png'),
});

app.setAsDefaultProtocolClient('homie');

app.whenReady().then(() => {
	registerIPC();
	createMenu();
	createWindow();
	createTray();
});

app.on('window-all-closed', () => {
	app.quit();
});

app.on('before-quit', () => {
	const win = getWindow();
	if (win) {
		config.set('lastWindowState', win.getBounds());
	}
});
