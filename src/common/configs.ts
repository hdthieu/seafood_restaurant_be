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
  VNP_TMN_CODE: process.env.VNP_TMN_CODE,
  VNP_HASH_SECRET: process.env.VNP_HASH_SECRET,
  VNP_URL: process.env.VNP_URL,
  VNP_RETURN_URL: process.env.VNP_RETURN_URL,
  VNP_LOCALE: process.env.VNP_LOCALE,
  VNP_VERSION: process.env.VNP_VERSION,
  FRONTEND_URL: process.env.FRONTEND_URL,
  // Mailer settings (used by MailService)
  mailService: process.env.MAIL_SERVICE || 'gmail',
  mailUser: process.env.MAIL_USER,
  mailPass: process.env.MAIL_PASS,

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET!,
    refreshSecret: process.env.JWT_REFRESH_SECRET!,
    accessExpires: process.env.JWT_ACCESS_EXPIRES || '120m',
    refreshExpires: process.env.JWT_REFRESH_EXPIRES || '30d'
  },
}