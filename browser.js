'use strict'
const { ipcRenderer } = require('electron')
const Bookmark = require('./bookmark')
const config = require('./config')

let main
let aside
const bookmarks = []
let currentBookmark

document.addEventListener('DOMContentLoaded', () => {
    main = document.querySelector('main')
    aside = document.querySelector('aside')

    for (const bookmarkData of config.get('bookmarks')) {
        createBookmark(bookmarkData)
    }

    showBookmark(0)

    document.documentElement.classList.toggle('dark-mode', config.get('darkMode'))
    document.documentElement.classList.toggle('show-hidden', config.get('showHidden'))
})

function createBookmark(data) {
    const b = new Bookmark(data)

    main.appendChild(b.view)

    aside.appendChild(b.handle)
    // aside.insertBefore(b.handle, aside.lastChild);

    bookmarks.push(b)

    b.hide()

    b.on('click', () => {
        if (b === currentBookmark) {
            return
        }

        b.show()

        if (currentBookmark !== undefined) {
            currentBookmark.hide()
        }

        currentBookmark = b
    })

    b.on('page-title-updated', event => {
        let messageCount = 0
        for (const bookmark of bookmarks) {
            messageCount += Number(bookmark.handle.getAttribute('data-message-count'))
        }
        // if (config.get('showUnreadBadge')) {
        ipcRenderer.send('page-title-updated', messageCount)
        // }
    })

    return b
}

var showBookmark = index => {
    bookmarks[index].handleIcon.click()
}

ipcRenderer.on('reload', () => {
    currentBookmark.reload()
})

ipcRenderer.on('reloadAll', () => {
    for (let bookmark of bookmarks) bookmark.reload()
})

// ipcRenderer.on('toggleHidden', () => {
// 	config.set('showHidden', !config.get('showHidden'));
// 	document.documentElement.classList.toggle('show-hidden', config.get('showHidden'));
// });

ipcRenderer.on('back', () => {
    currentBookmark.back()
})

ipcRenderer.on('forward', () => {
    currentBookmark.forward()
})

// ipcRenderer.on('zoom', dir => {
//     let zoomLevel = currentBookmark.view.getZoomLevel()
//     let zoomFactor = currentBookmark.view.getZoomFactor()
//     console.log(zoomLevel, zoomFactor)
//     currentBookmark.view.setZoomLevel(zoomLevel + (0.2 * dir)
// })

ipcRenderer.on('toggleSize', () => {
    currentBookmark.toggleSize()
})

ipcRenderer.on('toggleAlign', () => {
    currentBookmark.toggleAlign()
})

ipcRenderer.on('showBookmark', (event, args) => {
    showBookmark(args)
})

ipcRenderer.on('createNew', () => {
    ipcRenderer.send('createNew')
})

ipcRenderer.on('save', () => {
    const bookmarkData = config.get('bookmarks')
    document.querySelectorAll('webview').forEach((webview, i) => {
        bookmarkData[i].url = webview.src
    })
    config.set('bookmarks', bookmarkData)
})
