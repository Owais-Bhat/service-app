// Generates ai-video-catalog.json from the real Networking Experts service
// taxonomy (main category -> sub category). Each topic gets keywords drawn from
// the actual services and a YouTube *search* link that surfaces real, relevant
// solution videos. Paste a specific video into a topic's "youtube" field to
// embed it instead. Re-run after editing DATA:  node server/build-video-catalog.cjs
const fs = require('fs');
const path = require('path');

// main category -> { sub category -> representative keywords (from real services) }
const DATA = {
  'CCTV': {
    'Camera Issues': ['no video from camera', 'black screen', 'image rolling', 'flickering', 'blurry image', 'night vision not working', 'camera offline', 'color issue', 'PTZ not rotating', 'camera reset'],
    'DVR/NVR Issues': ['dvr not working', 'nvr dead', 'channel not showing', 'date and time', 'reboot repeatedly', 'overheating', 'hdmi vga output', 'password reset', 'firmware update', 'recording schedule'],
    'Recording & Storage Issues': ['hard disk error', 'hard disk not detecting', 'recording not working', 'storage full', 'hard disk formatting', 'playback not working', 'backup export to usb', 'recording days'],
    'Network/IP Issues': ['ip camera not connecting', 'ddns setup', 'dhcp', 'static ip', 'port forwarding', 'p2p cloud setup', 'poe switch setup', 'onvif adding', 'ip conflict', 'router configuration'],
    'IP CCTV Specific Issues': ['ip camera web access', 'poe camera no power', 'rtsp stream', 'onvif protocol', 'duplicate ip', 'firmware upgrade', 'camera activation', 'ntp time sync', 'not added to nvr'],
    'Mobile App & Remote View Issues': ['device offline in app', 'live view not working on phone', 'app password reset', 'cloud binding', 'push notification', 'qr code scan', 'remote playback', 'motion alert', 'mobile app setup'],
    'Analog CCTV Specific Issues': ['analog camera no signal', 'dvr channel issue', 'ahd tvi cvi mismatch', 'bnc signal loss', 'coaxial signal loss', 'compatibility check'],
    'Smart Detection & Analytics': ['number plate camera', 'face detection', 'motion detection', 'line crossing', 'human detection', 'intrusion detection', 'privacy mask', 'alarm output'],
    'Video Quality Issues': ['wrong resolution', 'frame rate', 'wdr blc', 'exposure brightness', 'video freezing', 'night video not clear', 'low quality', 'video lagging'],
    'Display/Monitor Issues': ['no display on monitor', 'hdmi cable', 'vga cable', 'monitor resolution', 'live view layout', 'camera sequence', 'display flickering'],
    'Cable & Connector Issues': ['rj45 crimping', 'bnc connector', 'dc connector', 'cable fault tracing', 'short circuit', 'continuity testing', 'cat6 cable', 'coaxial cable'],
    'Power Issues': ['fuse burnt', 'ups backup', 'power supply', 'power fluctuation', 'poe switch power', 'camera no power', 'smps replacement', 'adapter replacement'],
    'Installation Services': ['analog camera install', 'ip camera install', 'wifi camera', 'bullet camera', 'dome camera', 'ptz install', '4 8 16 32 channel setup', 'site survey', 'shifting reinstall'],
    'Replacement Services': ['camera replacement', 'monitor', 'poe switch', 'dvr replacement', 'nvr replacement', 'hard disk replacement', 'smps', 'router'],
    'Maintenance Services': ['dvr nvr cleaning', 'camera cleaning', 'health check', 'preventive maintenance', 'amc', 'system optimization', 'audit report'],
    'Accessory Services': ['microphone install', 'audio recording', 'pole bracket', 'weatherproof box', 'junction box', 'surge protector', 'rack arrangement'],
    'Security & User Access Issues': ['admin password reset', 'unauthorized access', 'user account', 'default password change', 'permission setup', 'device hardening', 'unbind from old account', 'account transfer'],
    'Troubleshooting Services': ['site revisit', 'full system diagnosis', 'single camera diagnosis', 'multiple camera diagnosis', 'emergency visit', 'intermittent issue'],
  },
  'Access Control': {
    'Biometric Issues': ['slow fingerprint response', 'device hang', 'fingerprint not detecting', 'face recognition not working'],
    'Door Lock Issues': ['electric strike', 'door not unlocking', 'magnetic lock failure', 'door sensor'],
    'RFID/Card Issues': ['rfid card not reading', 'card enrollment', 'access denied'],
    'Attendance Issues': ['shift setup', 'wrong attendance timing', 'attendance not recording'],
    'Network Issues': ['lan connectivity', 'ip configuration', 'remote access', 'wifi connection'],
    'Software Issues': ['software installation', 'user database', 'attendance software', 'password reset'],
    'Display Issues': ['display flickering', 'blank display', 'touch not working'],
    'Power Issues': ['battery backup', 'adaptor failure', 'device not powering on', 'fuse burnt'],
    'Installation Issues': ['rfid reader install', 'standalone access control', 'magnetic lock install', 'biometric device install'],
    'Maintenance Services': ['preventive maintenance', 'device cleaning', 'amc', 'firmware update'],
    'Physical Damage': ['water damage', 'loose wiring', 'broken device body'],
  },
  'Video Door Phone': {
    'Calling & Ringing Issues': ['call button not working', 'indoor monitor not ringing', 'delayed ringing', 'continuous ringing', 'wrong flat calling'],
    'Audio Issues': ['no audio', 'one way audio', 'low voice', 'echo noise', 'mic not working', 'speaker issue', 'distorted voice'],
    'Display & Video Issues': ['no video from outdoor unit', 'blank screen', 'flickering display', 'black and white image', 'night vision failure', 'low video quality', 'camera blur'],
    'Door Lock & Access Issues': ['door lock not opening', 'magnetic lock failure', 'relay issue', 'rfid card not detecting', 'exit switch not working', 'fingerprint failure', 'password unlock'],
    'Mobile App Issues': ['app not connecting', 'remote unlock not working', 'device not adding', 'qr setup failed', 'push notification failure', 'live view failure', 'app crash'],
    'Network & Connectivity Issues': ['wifi not connecting', 'lan disconnected', 'ip conflict', 'offline device', 'cloud p2p offline', 'poe issue', 'internet unavailable'],
    'Intercom Issues': ['indoor unit not calling', 'call drop', 'outdoor panel issue'],
    'Power Issues': ['no power', 'device dead', 'fuse burnt', 'adaptor smps failure', 'battery backup', 'short circuit', 'voltage drop'],
    'Camera Issues': ['camera not working', 'night vision issue', 'blur video', 'camera water damage'],
    'Software & Configuration Issues': ['firmware corruption', 'sip registration', 'indoor monitor pairing', 'factory reset', 'configuration mismatch', 'time date reset', 'device hanging'],
    'Hardware Damage Issues': ['motherboard damaged', 'touch panel damaged', 'mic damaged', 'speaker failure', 'button damaged', 'relay burnt', 'camera module faulty'],
    'Wiring & Cable Issues': ['shorted cable', 'cable cut', 'loose connection', 'poor crimping', 'wrong wiring polarity', 'long distance signal loss', 'connector rust'],
    'Installation Issues': ['wrong power supply', 'improper lock alignment', 'improper cable routing', 'wrong mounting', 'poor earthing', 'weak signal due to distance'],
    'Environmental Issues': ['moisture inside panel', 'heat overheating', 'rust corrosion', 'dust accumulation', 'rain water damage', 'insect damage'],
    'Physical Damage': ['broken panel', 'screen damaged', 'water leakage damage', 'loose wiring'],
    'User Operation Issues': ['wrong app usage', 'user forgot password', 'incorrect settings', 'unauthorized access attempt', 'wrong card usage'],
    'Maintenance & Service Issues': ['preventive maintenance', 'periodic testing', 'loose terminals', 'dirty camera lens', 'firmware not updated', 'backup battery weak'],
  },
  'Fire Alarm': {
    'Detector Issues': ['smoke detector not working', 'heat detector failure', 'false alarm', 'dust in detector'],
    'Panel Issues': ['panel hang', 'display not working', 'beeping continuously', 'zone not detecting'],
    'Siren/Hooter Issues': ['hooter not sounding', 'low siren sound', 'continuous hooter'],
    'Wiring Issues': ['short circuit', 'loose wiring', 'loop wiring fault', 'cable disconnected'],
    'Power Issues': ['panel not powering on', 'battery backup', 'power supply failure', 'fuse burnt'],
    'Network Issues': ['addressable panel communication', 'remote monitoring', 'lan wifi configuration'],
    'Software Issues': ['panel programming', 'device mapping', 'firmware update', 'password reset'],
    'Installation Issues': ['fire alarm panel install', 'smoke detector install', 'heat detector install', 'manual call point', 'hooter siren install'],
    'Maintenance Services': ['fire alarm testing', 'detector cleaning', 'preventive maintenance', 'annual maintenance contract'],
    'Physical Damage': ['water damage', 'broken detector', 'damaged panel'],
  },
  'Gate Automation & Barriers': {
    'Motor Issues': ['gate motor not working', 'motor overheating', 'motor noise', 'slow gate movement'],
    'Gate Movement Issues': ['gate not closing', 'gate stuck', 'track alignment', 'wheel damage'],
    'Barrier Issues': ['boom barrier not opening', 'barrier arm damaged', 'barrier control board', 'barrier sensor'],
    'Sensor Issues': ['safety sensor not detecting', 'infrared beam', 'false trigger'],
    'Remote Issues': ['remote not working', 'remote programming', 'rf receiver'],
    'Power Issues': ['gate motor not powering on', 'battery backup', 'power supply failure', 'fuse burnt'],
    'Networking Issues': ['smart app connection', 'remote access', 'wifi connectivity'],
    'Software Issues': ['automation programming', 'firmware update', 'password reset'],
    'Installation Issues': ['swing gate automation', 'sliding gate automation', 'boom barrier install', 'industrial gate motor', 'rfid barrier integration'],
    'Maintenance Services': ['track cleaning lubrication', 'sensor cleaning', 'preventive maintenance', 'annual maintenance contract'],
    'Physical Damage': ['gear damage', 'broken arm', 'water damage'],
  },
  'IT & Networking': {
    'Internet Issues': ['internet not working', 'slow internet speed', 'frequent disconnection', 'isp configuration'],
    'WiFi Issues': ['wifi not connecting', 'weak wifi signal', 'wifi password reset', 'access point issue'],
    'Router Issues': ['router not powering on', 'router configuration', 'router overheating', 'firmware update'],
    'LAN Issues': ['network port not working', 'lan cable fault', 'rj45 connector', 'switch port'],
    'Server Issues': ['server not connecting', 'dhcp configuration', 'ip conflict', 'dns issue'],
    'Network Security Issues': ['firewall configuration', 'vpn setup', 'unauthorized access'],
    'Software Issues': ['network printer setup', 'remote desktop', 'email configuration', 'shared folder'],
    'Installation Issues': ['new network setup', 'router install', 'switch install', 'access point install', 'server network setup', 'rack install'],
    'Maintenance Services': ['network health check', 'preventive maintenance', 'rack cleaning', 'annual maintenance contract'],
    'Physical Damage': ['cable damage', 'water damage', 'broken router switch'],
  },
};

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const searchUrl = (q) => 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q);

const videos = [];
for (const [main, subs] of Object.entries(DATA)) {
  for (const [sub, keywords] of Object.entries(subs)) {
    const cleanSub = sub.replace(/\b(Issues|Services)\b/gi, '').replace(/\s+/g, ' ').trim();
    videos.push({
      id: `${slug(main)}__${slug(sub)}`,
      service: `${main} — ${sub}`,
      summary: `Troubleshooting and service for ${sub.toLowerCase()} on ${main} systems. Covers: ${keywords.slice(0, 4).join(', ')}.`,
      keywords: [...new Set(
        [main.toLowerCase(), ...cleanSub.toLowerCase().split(' '), ...keywords]
          .filter(k => k && k.length > 1 && k !== '&')
      )],
      youtube: '',
      search: searchUrl(`${main} ${keywords[0]} how to fix`),
    });
  }
}

const out = {
  _README: "Service -> solution video catalog for the AI Assistant, generated from build-video-catalog.cjs. Each entry is a main-category/sub-category topic. Claude matches a technician's problem to the best topic. The 'search' link opens real YouTube results for that topic; paste a specific YouTube link into 'youtube' to embed one video instead. Edit DATA in build-video-catalog.cjs and re-run to regenerate.",
  videos,
};

fs.writeFileSync(path.join(__dirname, 'ai-video-catalog.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`Wrote ${videos.length} topics across ${Object.keys(DATA).length} categories to ai-video-catalog.json`);
