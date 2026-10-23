export default {
  packagerConfig: {
    name: 'Homie',
    icon: 'build/icon',
    appBundleId: 'se.jonasjohansson.homie',
    appCategoryType: 'public.app-category.productivity',
    protocols: [{ name: 'Web address', schemes: ['http', 'https'] }],
    extendInfo: {
      NSCameraUsageDescription: 'Video calls in a tab.',
      NSMicrophoneUsageDescription: 'Calls in a tab.',
      CFBundleDocumentTypes: [
        { CFBundleTypeName: 'Web page', CFBundleTypeRole: 'Viewer', LSHandlerRank: 'Alternate',
          LSItemContentTypes: ['public.html', 'public.xhtml'] },
      ],
    },
    ignore: [/^\/out/, /^\/scripts/, /^\/build\/icon\.png$/, /\.md$/, /^\/\.claude/, /^\/assets\/.*\.psd$/],
  },
  makers: [],
};
