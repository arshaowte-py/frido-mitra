// Frido Care · demonstration videos (third-party YouTube, embedded via youtube-nocookie).
// Placeholders until Frido records its own demos (brief §10: own videos + voice packs, ≤480p, offline).
// Each entry was picked from YouTube search results, preferring physiotherapy / hospital channels.
export const MEDIA = {
  'heel-raise': { videoId: 'CtyIVeJH6lI', title: "You're Doing Calf Raises WRONG | The Correct Way Taught By Physical Therapist", channel: 'Rehab and Revive', length: '1:48' },
  'plantar-stretch': { videoId: 'l5zCe0AdQks', title: 'Seated Plantar Fascia Stretch', channel: 'OrthoIndy', length: '0:29' },
  'foot-roller': { videoId: 'BD_qsnKZfM4', title: 'Foot Rolling | Physical Therapy for Plantar Fasciitis', channel: 'Physio Logic NYC', length: '0:29' },
  'balance': { videoId: 'l5pUSVgPnWk', title: 'Wobble Board Balance & Proprioception Training', channel: 'Total Body Physio', length: '0:55' },
  'toe-yoga': { videoId: 'SbQ2RYxbppE', title: 'Toe Yoga Exercise for Plantar Fasciitis', channel: 'Sharp HealthCare', length: '0:40' },
  'short-foot': { videoId: '_xISAvhnxjo', title: 'Short Foot Exercise', channel: 'ALTA Physical Therapy & Pilates', length: '0:31' },
  'toe-splay': { videoId: 'w4YfyOBjBGo', title: 'Toe Spread Out', channel: 'IPA Physio', length: '1:06' },
  'toe-squish': { videoId: 'L6fy1quJDOk', title: 'Big and Little Toe Lifts | B3 Physical Therapy', channel: 'Cara Giusti, PT, DPT', length: '1:25' },
  'towel-scrunch': { videoId: 'yELCLF0_Kvg', title: 'Toe Towel Crunch - Ask Doctor Jo', channel: 'AskDoctorJo', length: '0:24' },
  'toe-curl-band': { videoId: 'GdNgE3Jpk0o', title: 'Toe Flexion Curls - Band Resisted', channel: 'Healing Motion Physical Therapy', length: '0:29' },
  'knee-to-chest': { videoId: 'Yd9wY25koVk', title: 'Single Knee to Chest - Ask Doctor Jo', channel: 'AskDoctorJo', length: '0:27' },
  'bridge': { videoId: 'YRqoIM0u0PY', title: 'Wellness Wednesday: The glutes exercise you need to know', channel: 'Mayo Clinic', length: '0:50' },
  'bird-dog': { videoId: 'ed5K83RtKEA', title: 'Bird Dog Exercise', channel: 'Coury & Buehler Physical Therapy', length: '0:57' },
  'side-bend': { videoId: 'EPVVGkLmCSU', title: 'Physio Activity: Side Bend', channel: 'Nottinghamshire Healthcare', length: '0:35' },
  'pelvic-tilt': { videoId: 'ZIQjHtghzqw', title: 'Pelvic Tilt', channel: 'Baptist Health', length: '0:34' },
  'cat-camel': { videoId: 'JJkjIKlimW8', title: 'Cat & Camel', channel: 'Royal Free London NHS Foundation Trust', length: '0:51' },
  'squat': { videoId: 'KJ8xAMJdZjQ', title: 'Physical Therapist Shows Proper Squat Form', channel: 'Center For Total Back Care', length: '1:07' },
  'sit-to-stand': { videoId: 'ITv-_BkcrD0', title: 'Sit to Stand', channel: 'Baptist Health', length: '0:44' },
  'slr': { videoId: 'Ka19yzAlIGY', title: 'Straight Leg Raise Supine - Ask Doctor Jo', channel: 'AskDoctorJo', length: '0:37' },
  'knee-extension': { videoId: 'VuJZ6dqMf8M', title: 'Seated Knee Extension (LAQ) - Ask Doctor Jo', channel: 'AskDoctorJo', length: '0:26' },
  'neck-tilt': { videoId: '-r0eoFS7_5Q', title: 'Upper Trapezius Stretch - Ask Doctor Jo', channel: 'AskDoctorJo', length: '0:32' },
  'shoulder-flexion': { videoId: 'tQuhiZynpk0', title: 'OrthoIndy Exercises | Standing Single Shoulder Flexion', channel: 'OrthoIndy', length: '0:41' },
  'shoulder-abduction': { videoId: 'e6QBURFziQc', title: 'Standing Shoulder Abduction Active Movement', channel: 'Pure Physiotherapy', length: '0:57' },
  'chin-tuck': { videoId: '7rnlAVhAK-8', title: 'Chin Tucks Sitting - Ask Doctor Jo', channel: 'AskDoctorJo', length: '0:29' },
  'forward-bend': { videoId: 'cHjdA3f-81s', title: 'Standing Hamstring Stretch | B3 Physical Therapy', channel: 'Cara Giusti, PT, DPT', length: '0:57' },
  'hip-abduction': { videoId: 'qBqKuEQl9sI', title: 'Standing Hip Abduction - Ask Doctor Jo', channel: 'AskDoctorJo', length: '0:34' },
};

export const thumbUrl = id => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
export const embedUrl = id => `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1`;
export const watchUrl = id => `https://www.youtube.com/watch?v=${id}`;
