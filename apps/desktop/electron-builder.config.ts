import type { Configuration } from 'electron-builder'

const config: Configuration = {
  appId: 'com.racedash.app',
  productName: 'RaceDash',
  directories: {
    buildResources: 'build',
    output: 'release',
  },
  files: ['out/**/*'],
  mac: {
    icon: 'build/icon.icns',
    target: [{ target: 'dmg', arch: ['universal'] }],
    category: 'public.app-category.video',
  },
  win: {
    icon: 'build/icon.ico',
    target: [{ target: 'nsis', arch: ['x64'] }],
  },
  publish: {
    provider: 'github',
    owner: 'g30r93g',
    repo: 'racedash',
  },
}

export default config
