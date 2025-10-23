import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Phone, Shield, CheckCircle, AlertCircle, ArrowLeft } from "lucide-react";
import axios from "../../lib/axios";
import { useEffect } from "react";

export default function Login() {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState("request");
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState({ type: "", message: "" });
  const navigate = useNavigate();


  const showNotification = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => setNotification({ type: "", message: "" }), 5000);
  };

  const handleRequestOtp = async () => {
    if (!phone.trim()) {
      showNotification("error", "Please enter your phone number");
      return;
    }
        const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      showNotification("error", "Please enter a valid 10-digit phone number");
      return;
    }
    setLoading(true);
    try {
      await axios.post("/auth/request-otp", {  phone: cleanPhone });
      setStep("verify");
      showNotification("success", "Verification code sent to your phone");
    } catch (err) {
      console.error(err);
      showNotification("error", "Unable to send verification code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp.trim() || otp.length !== 6) {
      showNotification("error", "Please enter the complete 6-digit code");
      return;
    }

    setLoading(true);
    try {
      const cleanPhone = phone.replace(/\D/g, '');
      const res = await axios.post("/auth/login", {  phone: cleanPhone, otp });
      showNotification("success", "Login successful! Redirecting...");
      document.cookie = `token=${res.data.token}; path=/`;
      console.log("JWT stored in cookie: ", document.cookie);
      
      // Redirect to dashboard after a brief delay to show success message
      setTimeout(() => {
        navigate("/dashboard");
      }, 1500);
    } catch (err) {
      console.error(err);
      showNotification("error", "Invalid OTP or not registered. Please register first.");
    } finally {
      setLoading(false);
    }
  };

  const handleBackToPhone = () => {
    setStep("request");
    setOtp("");
    setNotification({ type: "", message: "" });
  };
useEffect(() => {
  console.log("👀 Cookies on mount:", document.cookie);
}, []);
  return (

    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Notification */}
        {notification.message && (
          <div className={`mb-6 p-4 rounded-lg border flex items-start gap-3 ${
            notification.type === "success" 
              ? "bg-green-50 border-green-200 text-green-800" 
              : "bg-red-50 border-red-200 text-red-800"
          }`}>
            {notification.type === "success" ? (
              <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
            )}
            <span className="text-sm font-medium">{notification.message}</span>
          </div>
        )}

        {/* Main Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-4">
              <Shield className="w-6 h-6 text-blue-600" />
            </div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">
              {step === "request" ? "Sign In" : "Verify Phone"}
            </h1>
            <p className="text-gray-600 text-sm leading-relaxed">
              {step === "request" 
                ? "Enter your phone number to receive a verification code"
                : `We sent a 6-digit code to ${phone}`
              }
            </p>
          </div>

          {/* Form */}
          <div className="space-y-6">
            {/* Phone Number Step */}
            {step === "request" && (
              <>
                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                    Phone Number
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      id="phone"
                      type="tel"
                      placeholder="(555) 123-4567"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-gray-900 placeholder-gray-500"
                      autoComplete="tel"
                    />
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    We'll send you a secure verification code
                  </p>
                </div>

                <button
                  onClick={handleRequestOtp}
                  disabled={loading || !phone.trim()}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Sending Code...
                    </>
                  ) : (
                    "Send Verification Code"
                  )}
                </button>
              </>
            )}

            {/* OTP Verification Step */}
            {step === "verify" && (
              <>
                <div>
                  <label htmlFor="otp" className="block text-sm font-medium text-gray-700 mb-2">
                    Verification Code
                  </label>
                  <input
                    id="otp"
                    type="text"
                    placeholder="000000"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-center text-lg tracking-wider font-mono"
                    maxLength={6}
                    autoComplete="one-time-code"
                  />
                  <p className="mt-2 text-xs text-gray-500">
                    Enter the 6-digit code sent to your phone
                  </p>
                </div>

                <button
                  onClick={handleVerifyOtp}
                  disabled={loading || otp.length !== 6}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Verifying...
                    </>
                  ) : (
                    "Verify & Sign In"
                  )}
                </button>

                <button
                  onClick={handleBackToPhone}
                  className="w-full text-gray-600 hover:text-gray-800 font-medium py-2 px-4 transition-colors flex items-center justify-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Use Different Phone Number
                </button>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500">
            Your information is protected with industry-standard security
          </p>
           <p className="text-sm text-gray-600">
            Not registered?{" "}
            <button
              onClick={() => navigate("/register")}
              className="text-blue-600 hover:text-blue-700 font-medium hover:underline"
            >
              Register now
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}