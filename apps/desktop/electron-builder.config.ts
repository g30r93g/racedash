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
    target: [{ target: 'dmg', arch: ['universal'] }],
    category: 'public.app-category.video',
  },
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
  },
  publish: {
    provider: 'github',
    owner: 'g30r93g',
    repo: 'racedash',
  },
}

export default config
