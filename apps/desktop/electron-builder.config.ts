import type { Configuration } from 'electron-builder'

const config: Configuration = {
  appId: 'com.racedash.app',
  productName: 'racedash',
  directories: {
    buildResources: 'build',
    output: 'release',
  },
  files: ['out/**/*'],
  mac: {
    target: [{ target: 'dmg', arch: ['arm64', 'x64'] }],
    category: 'public.app-category.video',
  },
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
  },
}

export default config
