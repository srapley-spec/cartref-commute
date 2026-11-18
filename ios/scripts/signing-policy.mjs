// Public identities only. Profile/key bytes are never returned by this module.
export const signingTargets = [
  { name: 'Cartref Commute App Store', bundleId: 'uk.cartref.srapley.commute', secret: 'IOS_APP_PROFILE_BASE64', file: 'app', app: true },
  { name: 'Cartref Commute Journey App Store', bundleId: 'uk.cartref.srapley.commute.journey', secret: 'IOS_ACTIVITY_PROFILE_BASE64', file: 'activity', app: false }
];
export function verifyEntitlements(entitlements, target) {
  const e = entitlements || {};
  if (e['application-identifier'] !== `TU7MLARY49.${target.bundleId}` ||
      e['com.apple.developer.team-identifier'] !== 'TU7MLARY49' || e['get-task-allow'] !== false) {
    throw new Error(`Wrong distribution entitlements for ${target.bundleId}.`);
  }
  if (target.app && (e['aps-environment'] !== 'production' ||
      !e['com.apple.security.application-groups']?.includes('group.uk.cartref.srapley.commute') ||
      e['com.apple.developer.networking.wifi-info'] !== true || e['com.apple.developer.siri'] !== true ||
      e['com.apple.developer.usernotifications.time-sensitive'] !== true)) {
    throw new Error('Commute distribution is missing a required native capability.');
  }
}
export function verifyProfile(profile, target, now = Date.now()) {
  if (profile.Name !== target.name || profile.ProvisionedDevices || profile.ProvisionsAllDevices ||
      !Number.isFinite(Date.parse(profile.ExpirationDate)) || Date.parse(profile.ExpirationDate) <= now + 86_400_000) {
    throw new Error(`Wrong or expired App Store profile for ${target.bundleId}. Renew its profile secret.`);
  }
  verifyEntitlements(profile.Entitlements, target);
}
