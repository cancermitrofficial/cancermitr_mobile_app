import { sendOtpToPhone, verifyOtpFromPhone } from './otp.service.js';
import { prisma } from './db.service.js';
import { assignDefaultRole } from './role.service.js';
import jwt from 'jsonwebtoken';

// Request OTP
export const handleRequestOtp = async (phone) => {
  await sendOtpToPhone(phone);
  return { message: 'OTP sent successfully' };
};

// Login (verify OTP for existing users only)
export const handleLogin = async (phone, otp) => {
  const isValid = await verifyOtpFromPhone(phone, otp);
  if (!isValid) throw { status: 400, message: 'Invalid or expired OTP' };

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) throw { status: 404, message: 'User not found. Please register.' };

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
  return { message: 'Login successful', token, user };
};

// Register (verify OTP + collect basic details)
export const handleRegister = async (phone, otp, name, email, age, gender) => {
  const isValid = await verifyOtpFromPhone(phone, otp);
  if (!isValid) throw { status: 400, message: 'Invalid or expired OTP' };

  let user = await prisma.user.findUnique({ where: { phone } });
  if (user) throw { status: 400, message: 'User already exists. Please login.' };

  user = await prisma.user.create({
    data: {
      phone,
      name,
      email,
      age: age ? Number(age) : null,
      gender
    }
  });

  await assignDefaultRole(user.id);

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
  return { message: 'Registration successful', token, user };
};

// Optional helper: Check if user exists by phone
export const handleCheckUserExists = async (phone) => {
  const user = await prisma.user.findUnique({ where: { phone } });
  return { exists: !!user };
};
