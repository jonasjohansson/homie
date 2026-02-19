export default {
	packagerConfig: {
		name: 'Homie',
		icon: './build/icon',
		appBundleId: 'se.jonasjohansson.homie',
		appCategoryType: 'public.app-category.social-networking',
		osxUniversal: {},
	},
	makers: [
		{
			name: '@electron-forge/maker-dmg',
			config: {
				format: 'ULFO',
				icon: './build/icon.icns',
			},
		},
		{
			name: '@electron-forge/maker-zip',
			platforms: ['darwin'],
		},
	],
};
