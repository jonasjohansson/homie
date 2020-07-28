'use strict'
const { app, session, BrowserWindow, ipcMain } = require('electron')
const { download } = require('electron-dl')
const electron = require('electron')
const tray = require('./tray')
const menu = require('./menu')
const config = require('./config')
const path = require('path')

download.directory = app.getPath('desktop')

let win = null

app.disableHardwareAcceleration()
app.allowRendererProcessReuse = true

app.on('ready', () => {
    try {
        const extensionPath = app.getPath('exe').replace('MacOS/Homie', 'extensions')
        BrowserWindow.addExtension(path.join(extensionPath, 'dgnlcodfeenegnifnpcabcclldoceeml/2.8_0'))
        BrowserWindow.addExtension(path.join(extensionPath, 'iajhmklhilkjgabejjemfbhmclgnmamf/1.20.2_0'))
    } catch (err) {
        console.error(err)
    }
    electron.Menu.setApplicationMenu(menu)
    createWindow()
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

const createWindow = async () => {
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
