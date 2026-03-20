// macOS notarization script for electron-builder
// To enable notarization, set these environment variables:
//   APPLE_ID        - Your Apple ID email
//   APPLE_APP_SPECIFIC_PASSWORD - App-specific password from appleid.apple.com
//   APPLE_TEAM_ID   - Your Apple Developer Team ID
//
// Also set mac.identity in package.json to your Developer ID Application certificate name.
// When identity is null (default), signing is skipped for local development.

const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return;

  // Skip if no Apple credentials are configured
  if (!process.env.APPLE_ID || !process.env.APPLE_APP_SPECIFIC_PASSWORD) {
    console.log('Skipping notarization: APPLE_ID or APPLE_APP_SPECIFIC_PASSWORD not set');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  console.log(`Notarizing ${appName}...`);

  await notarize({
    appBundleId: 'com.hider.reader',
    appPath: `${appOutDir}/${appName}.app`,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  });

  console.log('Notarization complete.');
};
