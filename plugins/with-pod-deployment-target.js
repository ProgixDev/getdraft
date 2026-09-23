// Xcode 27 rejects deployment targets below iOS 15.0. Some pods still declare
// 9.0–13.4 in their podspecs, so raise every pod target to the app's minimum.
const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER = '# with-pod-deployment-target';

module.exports = function withPodDeploymentTarget(config, { target = '15.1' } = {}) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfile, 'utf8');
      if (contents.includes(MARKER)) return cfg;

      const snippet = `
    ${MARKER}
    installer.pods_project.targets.each do |t|
      t.build_configurations.each do |c|
        if Gem::Version.new(c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] || '0') < Gem::Version.new('${target}')
          c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${target}'
        end
      end
    end
`;
      contents = contents.replace(/(post_install do \|installer\|\n)/, `$1${snippet}`);
      fs.writeFileSync(podfile, contents);
      return cfg;
    },
  ]);
};
