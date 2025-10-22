import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { User, Phone, Mail, Calendar, Users, Shield, CheckCircle, AlertCircle, ArrowLeft, ArrowRight } from "lucide-react";
import axios from "../../lib/axios";

export default function Register() {
  const [form, setForm] = useState({
    phone: "",
    name: "",
    email: "",
    age: "",
    gender: "",
    otp: ""
  });
  const [step, setStep] = useState("details"); // "details" or "verify"
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState({ type: "", message: "" });
  const [errors, setErrors] = useState({});
  const navigate = useNavigate();

  const showNotification = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => setNotification({ type: "", message: "" }), 5000);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors({ ...errors, [name]: "" });
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!form.name.trim()) newErrors.name = "Full name is required";
    if (!form.phone.trim()) newErrors.phone = "Phone number is required";
    if (!form.email.trim()) newErrors.email = "Email address is required";
    else if (!/\S+@\S+\.\S+/.test(form.email)) newErrors.email = "Please enter a valid email address";
    if (!form.age.trim()) newErrors.age = "Age is required";
    else if (parseInt(form.age) < 1 || parseInt(form.age) > 120) newErrors.age = "Please enter a valid age";
    if (!form.gender) newErrors.gender = "Please select your gender";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleContinueToVerification = async () => {
    if (!validateForm()) {
      showNotification("error", "Please fill in all required fields correctly");
      return;
    }

    setLoading(true);
    try {
      await axios.post("/auth/request-otp", { phone: form.phone });
      setStep("verify");
      showNotification("success", "Verification code sent to your phone");
    } catch (err) {
      console.error(err);
      showNotification("error", "Unable to send verification code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!form.otp.trim() || form.otp.length !== 6) {
      showNotification("error", "Please enter the complete 6-digit verification code");
      return;
    }

    setLoading(true);
    try {
      const { phone, name, email, age, gender, otp } = form;
      await axios.post("/auth/register", {
        phone,
        name,
        email,
        age: Number(age),
        gender,
        otp
      });
      showNotification("success", "Registration successful! Redirecting to login...");
      
      // Redirect to login page after a brief delay to show success message
      setTimeout(() => {
        navigate("/");
      }, 2000);
    } catch (err) {
      console.error(err);
      showNotification("error", "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleBackToDetails = () => {
    setStep("details");
    setForm({ ...form, otp: "" });
    setNotification({ type: "", message: "" });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
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
              {step === "details" ? (
                <User className="w-6 h-6 text-blue-600" />
              ) : (
                <Shield className="w-6 h-6 text-blue-600" />
              )}
            </div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">
              {step === "details" ? "Create Account" : "Verify Phone Number"}
            </h1>
            <p className="text-gray-600 text-sm leading-relaxed">
              {step === "details" 
                ? "Please provide your information to create your healthcare account"
                : `We sent a 6-digit code to ${form.phone}`
              }
            </p>
          </div>

          {/* Progress Steps */}
          <div className="flex items-center justify-center mb-8">
            <div className="flex items-center space-x-4">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                step === "details" 
                  ? "bg-blue-600 text-white" 
                  : "bg-blue-600 text-white"
              }`}>
                1
              </div>
              <div className={`h-0.5 w-16 ${
                step === "verify" ? "bg-blue-600" : "bg-gray-300"
              }`}></div>
              <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                step === "verify" 
                  ? "bg-blue-600 text-white" 
                  : "bg-gray-300 text-gray-500"
              }`}>
                2
              </div>
            </div>
          </div>

          {/* Step Labels */}
          <div className="flex justify-between text-xs text-gray-500 mb-8 px-4">
            <span className={step === "details" ? "font-medium text-blue-600" : ""}>
              Personal Details
            </span>
            <span className={step === "verify" ? "font-medium text-blue-600" : ""}>
              Phone Verification
            </span>
          </div>

          {/* Form Content */}
          <div className="space-y-6">
            {step === "details" && (
              <>
                {/* Full Name */}
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      id="name"
                      type="text"
                      name="name"
                      placeholder="Enter your full name"
                      value={form.name}
                      onChange={handleChange}
                      className={`w-full pl-11 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                        errors.name ? "border-red-300" : "border-gray-300"
                      }`}
                      autoComplete="name"
                    />
                  </div>
                  {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
                </div>

                {/* Phone Number */}
                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                    Phone Number <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      id="phone"
                      type="tel"
                      name="phone"
                      placeholder="(555) 123-4567"
                      value={form.phone}
                      onChange={handleChange}
                      className={`w-full pl-11 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                        errors.phone ? "border-red-300" : "border-gray-300"
                      }`}
                      autoComplete="tel"
                    />
                  </div>
                  {errors.phone && <p className="mt-1 text-sm text-red-600">{errors.phone}</p>}
                </div>

                {/* Email */}
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      id="email"
                      type="email"
                      name="email"
                      placeholder="your.email@example.com"
                      value={form.email}
                      onChange={handleChange}
                      className={`w-full pl-11 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                        errors.email ? "border-red-300" : "border-gray-300"
                      }`}
                      autoComplete="email"
                    />
                  </div>
                  {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email}</p>}
                </div>

                {/* Age and Gender Row */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Age */}
                  <div>
                    <label htmlFor="age" className="block text-sm font-medium text-gray-700 mb-2">
                      Age <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        id="age"
                        type="number"
                        name="age"
                        placeholder="25"
                        value={form.age}
                        onChange={handleChange}
                        min="1"
                        max="120"
                        className={`w-full pl-11 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                          errors.age ? "border-red-300" : "border-gray-300"
                        }`}
                      />
                    </div>
                    {errors.age && <p className="mt-1 text-sm text-red-600">{errors.age}</p>}
                  </div>

                  {/* Gender */}
                  <div>
                    <label htmlFor="gender" className="block text-sm font-medium text-gray-700 mb-2">
                      Gender <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Users className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <select
                        id="gender"
                        name="gender"
                        value={form.gender}
                        onChange={handleChange}
                        className={`w-full pl-11 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors appearance-none bg-white ${
                          errors.gender ? "border-red-300" : "border-gray-300"
                        }`}
                      >
                        <option value="">Select</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                        <option value="Prefer not to say">Prefer not to say</option>
                      </select>
                    </div>
                    {errors.gender && <p className="mt-1 text-sm text-red-600">{errors.gender}</p>}
                  </div>
                </div>

                <button
                  onClick={handleContinueToVerification}
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Sending Code...
                    </>
                  ) : (
                    <>
                      Continue to Verification
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </>
            )}

            {step === "verify" && (
              <>
                <div>
                  <label htmlFor="otp" className="block text-sm font-medium text-gray-700 mb-2">
                    Verification Code
                  </label>
                  <input
                    id="otp"
                    type="text"
                    name="otp"
                    placeholder="000000"
                    value={form.otp}
                    onChange={(e) => setForm({ ...form, otp: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-center text-lg tracking-wider font-mono"
                    maxLength={6}
                    autoComplete="one-time-code"
                  />
                  <p className="mt-2 text-xs text-gray-500">
                    Enter the 6-digit code sent to your phone
                  </p>
                </div>

                <button
                  onClick={handleRegister}
                  disabled={loading || form.otp.length !== 6}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Creating Account...
                    </>
                  ) : (
                    "Complete Registration"
                  )}
                </button>

                <button
                  onClick={handleBackToDetails}
                  className="w-full text-gray-600 hover:text-gray-800 font-medium py-2 px-4 transition-colors flex items-center justify-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Edit Details
                </button>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500 mb-2">
            By creating an account, you agree to our Terms of Service and Privacy Policy
          </p>
          <p className="text-xs text-gray-500">
            Your health information is protected with industry-standard security
          </p>
        </div>
      </div>
    </div>
  );
}