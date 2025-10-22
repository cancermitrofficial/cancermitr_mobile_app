import { generateOtp } from '../utils/generateOtp.util.js';
import { redis } from './redis.service.js';
import { sendViaSmsAlert } from './smsProviders/smsalert.provider.js';

const OTP_TTL = 300; // 5 minutes

export const sendOtpToPhone = async (phone) => {
  const otp = generateOtp();
  console.log(`Generated OTP for ${phone}: ${otp}`);
  await redis.set(`otp:${phone}`, otp, 'EX', OTP_TTL);
  const redisData = await redis.get(`otp:${phone}`);
    console.log(`Stored OTP in Redis for ${phone}: ${redisData}`);
  const sent = await sendViaSmsAlert(phone, otp);
  if (!sent) throw { status: 500, message: 'Failed to send OTP' };
  return otp;
};

export const verifyOtpFromPhone = async (phone, otp) => {
  const storedOtp = await redis.get(`otp:${phone}`);
  console.log(`Verifying OTP for ${phone}. Stored: ${storedOtp}, Received: ${otp}`);

  if (!storedOtp || storedOtp !== String(otp)) {
    return false;
  }

  await redis.del(`otp:${phone}`);
  return true;
};

