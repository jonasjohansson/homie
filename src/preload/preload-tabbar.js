const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('homie', {
	getBookmarks: () => ipcRenderer.invoke('get-bookmarks'),
	switchTab: (index) => ipcRenderer.invoke('switch-tab', index),
	onUnread: (callback) => {
		ipcRenderer.on('unread-update', (_event, index, hasUnread) => {
			callback(index, hasUnread);
		});
	},
	onActiveTab: (callback) => {
		ipcRenderer.on('active-tab', (_event, index) => {
			callback(index);
		});
	},
});
