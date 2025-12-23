export const REASON_MAPPING = [
  ["vehicle_auto_emergency_braking", "自動緊急煞車"],
  ["user_interaction_dashcam_icon_tapped", "點擊行車記錄器圖示"],
  ["user_interaction_dashcam_panel_save", "行車記錄器面板儲存"],
  ["user_interaction_honk", "按下喇叭"],
  ["user_interaction_", "手動儲存"],
  ["sentry_aware_object_detection", "哨兵物體偵測"],
  ["sentry_aware_accel_", "哨兵搖晃偵測"],
  ["sentry_", "哨兵模式"],
];

export const CAMERA_SETTINGS = {
  front: { file: "front", name: "前", mirror: false, sort: 0, sortView: 1 },
  back: { file: "back", name: "後", mirror: true, sort: 1, sortView: 2 },
  left_repeater: { file: "left_repeater", name: "左", mirror: true, sort: 2, sortView: 0 },
  right_repeater: { file: "right_repeater", name: "右", mirror: true, sort: 3, sortView: 3 },
  inside: { file: "inside", name: "內", mirror: false, sort: 4, sortView: 4 }
};

export const CAMERA_INDEX_MAP = [
  { id: 0, ...CAMERA_SETTINGS.front },
  { id: 1, ...CAMERA_SETTINGS.front },
  { id: 2, ...CAMERA_SETTINGS.front },
  { id: 3, ...CAMERA_SETTINGS.left_repeater },
  { id: 4, ...CAMERA_SETTINGS.right_repeater },
  { id: 5, ...CAMERA_SETTINGS.left_repeater },
  { id: 6, ...CAMERA_SETTINGS.right_repeater },
  { id: 7, ...CAMERA_SETTINGS.back },
  { id: 8, ...CAMERA_SETTINGS.inside },
];

export const PLAYBACK_RATES = [0.25, 0.5, 1, 2, 4];
export const DEFAULT_CLIP_DURATION = 60;
