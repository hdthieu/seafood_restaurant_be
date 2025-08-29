require('dotenv').config()
export const configurations = {
  nodeEnv: process.env.NODE_ENV,
  port: parseInt(process.env.APP_PORT || '8001', 10),
  appAddress: process.env.APP_ADDRESS,
  verifyURL: process.env.VERIFY_URL,
  provisioning: process.env.PROVISIONING_URL,
  emailSupport: process.env.EMAIL_SUPPORT,
  websiteURL: process.env.WEBSITE_URL,
  adminPassword: process.env.ADMIN_PASSWORD,
  TZ: process.env.TZ,
  VERIFY_DEV_MODE: process.env.VERIFY_DEV_MODE,
}