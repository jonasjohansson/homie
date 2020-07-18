'use strict'
const { app, session, BrowserWindow, ipcMain } = require('electron')
const { download } = require('electron-dl')
const electron = require('electron')
const tray = require('./tray')
const menu = require('./menu')
const config = require('./config')
const path = require('path')

download.directory = app.getPath('desktop')

// https://github.com/sindresorhus/electron-context-menu
// https://medium.com/missive-app/make-your-electron-app-dark-mode-compatible-c23dcfdd0dfa
// https://electronjs.org/docs/tutorial/mojave-dark-mode-guide

let win = null

app.disableHardwareAcceleration()

app.on('ready', async () => {
    electron.Menu.setApplicationMenu(menu)
    createWindow()
    // https://www.electronjs.org/docs/api/session#sesloadextensionpath
    await session.defaultSession.loadExtension(path.join(__dirname, 'addons/list-layouts-for-trello/'))
    await session.defaultSession.loadExtension(path.join(__dirname, 'addons/next-step-for-trello/'))
})

app.on('window-all-closed', () => {
    app.quit()
})

app.on('activate', () => {
    win.show()
})

app.on('before-quit', () => {
    config.set('lastWindowState', win.getBounds())
})

const createWindow = () => {
    const lastWindowState = config.get('lastWindowState')

    win = new BrowserWindow({
        title: app.name,
        x: lastWindowState.x,
        y: lastWindowState.y,
        width: lastWindowState.width,
        height: lastWindowState.height,
        minWidth: 400,
        minHeight: 200,
        webPreferences: {
            nodeIntegration: true,
            // https://electronjs.org/docs/api/webview-tag
            // https://electronjs.org/docs/api/browser-window
            webviewTag: true
        }
    })

    win.loadURL(`file://${__dirname}/index.html`)

    tray.create(win)
}

// let badgeIcon = config.get('badgeIcon');

ipcMain.on('page-title-updated', (events, args) => {
    app.badgeCount = args
    tray.setBadge(args)
    // if (badgeIcon !== '') {
    // let msg = args > 0 ? badgeIcon : '';
    // msg = "\033[" + 31 + "m" + msg + "\033[0m";
    // tray.setTitle(args.toString());
    // tray.setTitle(msg);
    // }
})

ipcMain.on('createNew', () => {
    createWindow()
})
