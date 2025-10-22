import { handleRequestOtp, handleLogin, handleRegister } from '../services/auth.service.js';

export const requestOtp = async (req, res, next) => {
  try {
    const { phone } = req.body;
    if (!phone) throw { status: 400, message: 'Phone number is required' };
    const result = await handleRequestOtp(phone);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const login = async (req, res, next) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) throw { status: 400, message: 'Phone and OTP are required' };
    const result = await handleLogin(phone, otp);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const register = async (req, res, next) => {
  try {
    const { phone, otp, name, email, age, gender } = req.body;
    if (!phone || !otp || !name || !email) {
      throw { status: 400, message: 'Missing required registration fields' };
    }
    const result = await handleRegister(phone, otp, name, email, age, gender);
    res.status(201).json(result);
  } catch (err) {
    next(err);
    console.error('Error registering user:', err);
  }
};


