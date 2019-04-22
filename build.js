'use strict';

const builder = require('electron-builder');
const Platform = builder.Platform;

// https://www.electron.build/configuration/dmg
// Promise is returned
builder
	.build({
		targets: Platform.MAC.createTarget(),
		config: {
			appId: 'se.jonasjohansson.homie',
			mac: {
				category: 'public.app-category.social-networking',
				target: ['dir', 'dmg'],
				electronUpdaterCompatibility: '>=2.16.0'
			},
			dmg: {
				title: '${name}',
				backgroundColor: '#999',
				// icon: 'build/icon-negative.png',
				iconSize: 100
			}
		}
	})
	.then(() => {
		// handle result
	})
	.catch(error => {
		// handle error
	});

// build options, see https://goo.gl/QQXmcV
// https://www.electron.build/configuration/mac
