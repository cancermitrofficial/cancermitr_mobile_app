import axios from 'axios';
// import { console } from 'inspector';
import querystring from 'querystring';


export const sendViaSmsAlert = async (phone, otp) => {
  const API_KEY = process.env.SMSALERT_API_KEY;
  const SENDER_ID = process.env.
  SMSALERT_SENDER_ID;
  const message = `Your CancerMitr OTP Verification code is  ${otp} do not share it with anyone. Arnam Impact.`;
  const smsText = encodeURIComponent(message);
  console.log(`Sending SMS to ${phone}: ${smsText}`);
  console.log(`Using API Key: ${API_KEY}, Sender ID: ${SENDER_ID}`);

  const url = `https://www.smsalert.co.in/api/push.json?apikey=${API_KEY}&sender=${SENDER_ID}&mobileno=${phone}&text=${smsText}`;

  try {
    const response = await axios.get(url, {
      validateStatus: false,
      httpsAgent: new (await import('https')).Agent({
        rejectUnauthorized: false // same as CURLOPT_SSL_VERIFYPEER = false
      })
    });

    if (response.status !== 200 || response.data.status !== 'success') {
      console.error('SMSAlert response:', response.data);
      throw new Error(response.data.description || 'SMS sending failed');
    }

    return true;
  } catch (err) {
    console.error('SMSAlert Error:', err.message);
    return false;
  }
};
