import express from 'express';
import { requestOtp, login, register } from '../controllers/auth.controller.js';
import { rateLimiter } from '../middleware/rateLimiter.middleware.js';

const router = express.Router();

// router.post('/request-otp', rateLimiter, requestOtp);
// router.post('/login', rateLimiter, login);
// router.post('/register', rateLimiter, register);

router.post('/request-otp', requestOtp);
router.post('/login', login);
router.post('/register', register);

export default router;


// import express from 'express';
// import { requestOtp, login, register } from '../controllers/auth.controller.js';
// import { rateLimiter } from '../middleware/rateLimiter.middleware.js';

// const router = express.Router();

// console.log('🔍 DEBUG: Starting auth routes setup...');

// try {
//     console.log('🔍 DEBUG: Adding POST /request-otp...');
//     router.post('/request-otp', requestOtp);
//     console.log('✅ SUCCESS: POST /request-otp added');
// } catch (error) {
//     console.error('❌ ERROR: Failed to add POST /request-otp:', error.message);
//     throw error;
// }

// try {
//     console.log('🔍 DEBUG: Adding POST /login...');
//     router.post('/login', login);
//     console.log('✅ SUCCESS: POST /login added');
// } catch (error) {
//     console.error('❌ ERROR: Failed to add POST /login:', error.message);
//     throw error;
// }

// try {
//     console.log('🔍 DEBUG: Adding POST /register...');
//     router.post('/register', register);
//     console.log('✅ SUCCESS: POST /register added');
// } catch (error) {
//     console.error('❌ ERROR: Failed to add POST /register:', error.message);
//     throw error;
// }

// console.log('🔍 DEBUG: Auth routes setup complete');

// export default router;
