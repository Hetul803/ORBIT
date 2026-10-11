const validTestFlight = (value) => {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'testflight.apple.com' &&
      /^\/join\/[A-Za-z0-9]{6,16}$/u.test(url.pathname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
};
const validApk = (value, hash) => {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      /\.apk$/iu.test(url.pathname) &&
      /^[a-f0-9]{64}$/u.test(hash) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
};
const addLink = (id, url, label) => {
  const link = document.createElement('a');
  link.className = 'button';
  link.href = url;
  link.textContent = label;
  link.rel = 'noopener noreferrer';
  document.getElementById(id)?.replaceChildren(link);
};
fetch('/release-config.json', { cache: 'no-store' })
  .then(async (response) => {
    if (!response.ok) throw new Error('Release configuration unavailable');
    const config = await response.json();
    let enabled = 0;
    if (validTestFlight(config.testFlightUrl)) {
      addLink('ios-download', config.testFlightUrl, 'Join ORBIT on TestFlight ↗');
      enabled++;
    }
    if (validApk(config.androidApkUrl, config.androidApkSha256)) {
      addLink('android-download', config.androidApkUrl, 'Download signed Android APK ↗');
      enabled++;
      const checksum = document.getElementById('apk-checksum');
      if (checksum) {
        checksum.hidden = false;
        checksum.textContent = `SHA-256: ${config.androidApkSha256}`;
      }
    }
    const status = document.getElementById('release-status');
    if (status && enabled)
      status.textContent = `${enabled === 2 ? 'Both platforms have' : 'One platform has'} a configured release link. Account admission remains subject to the server’s alpha limit and safety checks.`;
    if (
      typeof config.supportEmail === 'string' &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(config.supportEmail)
    ) {
      const node = document.getElementById('private-support');
      if (node) {
        const link = document.createElement('a');
        link.href = `mailto:${config.supportEmail}`;
        link.textContent = config.supportEmail;
        node.replaceChildren(link);
      }
    }
  })
  .catch(() => {
    /* Leave unavailable states intact; never create a fallback download. */
  });
