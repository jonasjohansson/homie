import { Tray } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getWindow, switchTo, getUnreadIndex } from './views.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.join(__dirname, '..', '..', 'assets');

const trayIconDefault = path.join(assetsDir, 'trayIcon.png');
const trayIconUnread = path.join(assetsDir, 'trayIconUnread.png');

let tray = null;

export function createTray() {
	tray = new Tray(trayIconDefault);
	tray.on('click', () => {
		const win = getWindow();
		if (win) {
			win.show();
			win.focus();
			switchTo(getUnreadIndex());
		}
	});
}

export function setBadge(shouldDisplayUnread) {
	if (!tray) return;
	const icon = shouldDisplayUnread ? trayIconUnread : trayIconDefault;
	tray.setImage(icon);
}
