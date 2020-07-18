'use strict'
const Store = require('electron-store')

module.exports = new Store({
    name: 'lookup',
    defaults: {
        calendar: 'icons8-calendar-color.svg',
        contacts: 'icons8-contacts-color.svg',
        discord: 'icons8-discord-color.svg',
        drive: 'icons8-google-drive-color.svg',
        document: 'icons8-google-docs-color.svg',
        facebook: 'icons8-facebook.svg',
        // inbox: 'inbox-color.png',
        list: 'icons8-list-color.png',
        mail: 'icons8-gmail-color.svg',
        maps: 'icons8-marker-96.png',
        mixcloud: 'cloud.svg',
        messenger: 'icons8-facebook-messenger-color.svg',
        notion: 'icons8-checklist-96.png',
        overcast: 'overcast.svg',
        pinterest: 'icons8-pinterest.svg',
        pocketcasts: 'pocketcasts.png',
        spreadsheets: 'icons8-google-sheets-color.svg',
        slack: 'Slack_Mark.svg',
        spotify: 'icons8-spotify.svg',
        trello: 'icons8-trello.svg',
        whatsapp: 'icons8-whatsapp.svg',
        translate: 'icons8-google-translate.svg',
        keep: 'icons8-google-keep.svg'
    }
})
