'use strict'
const { app, session, BrowserWindow, ipcMain } = require('electron')
const { download } = require('electron-dl')
const electron = require('electron')
const tray = require('./tray')
const menu = require('./menu')
const config = require('./config')
const { lstatSync, readdirSync } = require('fs')
const { join } = require('path')

download.directory = app.getPath('desktop')

let win = null
app.disableHardwareAcceleration()
app.allowRendererProcessReuse = true

app.on('ready', () => {
    getExtensions()
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

const getExtensions = () => {
    const installedExtensions = getDirectories(
        process.env.HOME + '/Library/Application Support/Google/Chrome/Default/Extensions'
    )
    const extensions = []
    for (let ext of installedExtensions) {
        const version = getDirectories(ext)
        extensions.push(version)
        try {
            BrowserWindow.addExtension(version + '/')
        } catch (err) {
            console.error(err)
        }
    }
    config.set('extensions', extensions)
}

const isDirectory = source => lstatSync(source).isDirectory()
const getDirectories = source =>
    readdirSync(source)
        .map(name => join(source, name))
        .filter(isDirectory)
