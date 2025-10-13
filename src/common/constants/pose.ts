// constants.ts
export const POSE_THRESH = {
  YAW_MIN: 8,          // ↓ từ 10 → 8 độ (ít quay hơn vẫn pass)
  PITCH_ABS_MAX: 25,   // ↑ từ 20 → 25 độ (cúi/ngửa thoáng hơn)
};

export const EYES_CONF_MIN = 60; // ↓ từ 70 → 60 (BLINK dễ nhận hơn)

// Nếu nghi vấn ảnh bị mirror, để true (đảo dấu yaw). Nếu chắc không mirror: false
export const FRONT_MIRROR = true;
export const CHALLENGE_TTL = 2 * 60_000;
