import React, { useEffect, useState } from "react";
import axios from "../../lib/axios";
import Cookies from "js-cookie";
import {
  User, FileText, Bot, Heart, Activity, Bell, Settings,
  LogOut, ChevronRight, Mail, Phone, Calendar, Shield,
  CheckCircle, X, Menu
} from "lucide-react";


export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [notifications, setNotifications] = useState([
    { id: 1, type: "result", message: "Lab results are now available for review", time: "1 day ago" },
    { id: 2, type: "reminder", message: "Health report analysis completed", time: "3 hours ago" }
  ]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [stats, setStats] = useState({
    completedReports: 0,
    totalReports: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeDashboard = async () => {
      await fetchUserProfile();
      await fetchStats();
      setLoading(false);
    };
    
    initializeDashboard();
  }, []);

  const fetchUserProfile = async () => {
    try {
      const token = Cookies.get("token");
      
      if (!token) {
        console.warn("No token found in cookies");
        window.location.href = "/";
        return;
      }

      const res = await axios.get("/user/profile", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setUser(res.data.user || res.data); 
    } catch (err) {
      console.error("Failed to fetch profile:", err);
      if (err.response?.status === 401) {
        Cookies.remove("token");
        window.location.href = "/";
      }
    }
  };

  const fetchStats = async () => {
    try {
      const token = Cookies.get("token");
      const response = await axios.get('/user/stats', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (response.data.success && response.data.stats) {
        setStats({
          completedReports: response.data.stats.completedReports || 0,
          totalReports: response.data.stats.totalReports || 0
        });
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
      // Keep default stats on error
    }
  };

  const dismissNotification = (id) => {
    setNotifications(notifications.filter((n) => n.id !== id));
  };

  const handleNavigation = (path) => {
    window.location.href = path;
  };

  const handleLogout = () => {
    Cookies.remove("token");
    setUser(null);
    window.location.href = "/";
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const formatDate = (dateString) => {
    if (!dateString) return "Recently";
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-600 text-lg font-medium">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-blue-600 to-green-600 rounded-xl flex justify-center items-center shadow-lg">
                <Heart className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-gray-900">HealthCare Portal</h1>
                <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">Your health, simplified</p>
              </div>
            </div>

            <div className="flex gap-2 sm:gap-4 items-center">
              {/* Notifications */}
              <div className="relative">
                <button
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="relative p-2 sm:p-3 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-all duration-200"
                >
                  <Bell className="w-5 h-5" />
                  {notifications.length > 0 && (
                    <span className="absolute top-0 right-0 text-xs bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center font-semibold shadow-lg">
                      {notifications.length}
                    </span>
                  )}
                </button>

                {showNotifications && (
                  <>
                    <div 
                      className="fixed inset-0 z-40"
                      onClick={() => setShowNotifications(false)}
                    ></div>
                    <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
                      <div className="p-4 border-b border-gray-100 bg-gray-50">
                        <h3 className="font-semibold text-gray-900">Notifications</h3>
                      </div>
                      <div className="max-h-64 overflow-y-auto">
                        {notifications.length === 0 ? (
                          <div className="p-6 text-center text-gray-500">
                            <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No new notifications</p>
                          </div>
                        ) : (
                          notifications.map((n) => (
                            <div key={n.id} className="p-4 border-b border-gray-50 hover:bg-gray-50 transition-colors">
                              <div className="flex justify-between items-start gap-3">
                                <div className="flex-1">
                                  <p className="text-sm text-gray-900 leading-relaxed">{n.message}</p>
                                  <p className="text-xs text-gray-500 mt-2">{n.time}</p>
                                </div>
                                <button
                                  onClick={() => dismissNotification(n.id)}
                                  className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* User Avatar - Desktop */}
              <div className="hidden sm:flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-100 to-green-100 rounded-full flex justify-center items-center text-blue-700 font-bold text-lg shadow-sm">
                  {user.name?.[0]?.toUpperCase() || "U"}
                </div>
                <button 
                  onClick={handleLogout}
                  className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Logout"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>

              {/* Mobile Menu Toggle */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="sm:hidden p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                <Menu className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="sm:hidden border-t border-gray-200 bg-white">
            <div className="p-4 space-y-2">
              <div className="flex items-center gap-3 pb-3 border-b border-gray-200">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-100 to-green-100 rounded-full flex justify-center items-center text-blue-700 font-bold text-lg">
                  {user.name?.[0]?.toUpperCase() || "U"}
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{user.name}</p>
                  <p className="text-sm text-gray-600">{user.phone}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 p-3 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <LogOut className="w-5 h-5" />
                <span className="font-medium">Logout</span>
              </button>
            </div>
          </div>
        )}
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
            {getGreeting()}, {user.name?.split(' ')[0] || 'there'}
          </h2>
          <p className="text-gray-600">Manage your health records and get AI-powered insights</p>
        </div>

        {/* Main Action Cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-8">
          {/* Profile Card */}
          <button
            onClick={() => handleNavigation("/profile")}
            className="group bg-white hover:bg-gradient-to-br hover:from-blue-50 hover:to-blue-100 border-2 border-gray-200 hover:border-blue-300 p-6 sm:p-8 rounded-2xl transition-all duration-300 transform hover:scale-105 shadow-md hover:shadow-xl text-left"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-blue-100 group-hover:bg-blue-200 rounded-xl transition-colors">
                <User className="w-7 h-7 text-blue-600" />
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">My Profile</h3>
            <p className="text-sm text-gray-600">View and manage your personal information</p>
          </button>

          {/* Health Locker Card */}
          <button
            onClick={() => handleNavigation("/health-locker")}
            className="group bg-white hover:bg-gradient-to-br hover:from-green-50 hover:to-green-100 border-2 border-gray-200 hover:border-green-300 p-6 sm:p-8 rounded-2xl transition-all duration-300 transform hover:scale-105 shadow-md hover:shadow-xl text-left"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-green-100 group-hover:bg-green-200 rounded-xl transition-colors">
                <FileText className="w-7 h-7 text-green-600" />
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-green-600 transition-colors" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Health Locker</h3>
            <p className="text-sm text-gray-600">Access your medical records and reports</p>
          </button>

          {/* Ask AI Card */}
          <button
            onClick={() => handleNavigation("/ask-ai")}
            className="group bg-gradient-to-br from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 border-2 border-purple-600 p-6 sm:p-8 rounded-2xl transition-all duration-300 transform hover:scale-105 shadow-md hover:shadow-xl text-left sm:col-span-2 lg:col-span-1"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-white/20 group-hover:bg-white/30 rounded-xl transition-colors">
                <Bot className="w-7 h-7 text-white" />
              </div>
              <ChevronRight className="w-5 h-5 text-white/80 group-hover:text-white transition-colors" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Ask AI Assistant</h3>
            <p className="text-sm text-white/90">Get instant answers to your health questions</p>
          </button>
        </div>

        <div className="grid lg:grid-cols-3 gap-6 sm:gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6 sm:space-y-8">
            {/* User Profile Card */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg sm:text-xl font-bold text-gray-900">Profile Information</h3>
              </div>
              
              <div className="space-y-4">
                <div className="p-4 bg-gradient-to-r from-blue-50 to-blue-100 rounded-xl border border-blue-200">
                  <div className="flex items-center gap-3 mb-2">
                    <User className="w-5 h-5 text-blue-600" />
                    <span className="text-sm font-medium text-gray-700">Full Name</span>
                  </div>
                  <p className="text-lg font-semibold text-gray-900">{user.name}</p>
                </div>
                
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="p-4 bg-gradient-to-r from-green-50 to-green-100 rounded-xl border border-green-200">
                    <div className="flex items-center gap-3 mb-2">
                      <Phone className="w-5 h-5 text-green-600" />
                      <span className="text-sm font-medium text-gray-700">Phone</span>
                    </div>
                    <p className="text-base sm:text-lg font-semibold text-gray-900">{user.phone}</p>
                  </div>

                  {user.email && (
                    <div className="p-4 bg-gradient-to-r from-purple-50 to-purple-100 rounded-xl border border-purple-200">
                      <div className="flex items-center gap-3 mb-2">
                        <Mail className="w-5 h-5 text-purple-600" />
                        <span className="text-sm font-medium text-gray-700">Email</span>
                      </div>
                      <p className="text-base sm:text-lg font-semibold text-gray-900 truncate">{user.email}</p>
                    </div>
                  )}
                </div>

                <div className="p-4 bg-gradient-to-r from-orange-50 to-orange-100 rounded-xl border border-orange-200">
                  <div className="flex items-center gap-3 mb-2">
                    <Calendar className="w-5 h-5 text-orange-600" />
                    <span className="text-sm font-medium text-gray-700">Member Since</span>
                  </div>
                  <p className="text-lg font-semibold text-gray-900">{formatDate(user.createdAt)}</p>
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 sm:p-8 shadow-sm">
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-6">Health Overview</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 sm:p-6 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl border border-blue-200">
                  <div className="w-12 h-12 bg-blue-200 rounded-full flex items-center justify-center mx-auto mb-3">
                    <FileText className="w-6 h-6 text-blue-700" />
                  </div>
                  <p className="text-2xl sm:text-3xl font-bold text-gray-900">{stats.completedReports}</p>
                  <p className="text-xs sm:text-sm text-gray-600 mt-1">Medical Records</p>
                </div>
                
                <div className="text-center p-4 sm:p-6 bg-gradient-to-br from-green-50 to-green-100 rounded-xl border border-green-200">
                  <div className="w-12 h-12 bg-green-200 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Activity className="w-6 h-6 text-green-700" />
                  </div>
                  <p className="text-2xl sm:text-3xl font-bold text-gray-900">{stats.totalReports}</p>
                  <p className="text-xs sm:text-sm text-gray-600 mt-1">Reports Analyzed</p>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6 sm:space-y-8">
            {/* Quick Access Menu */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Quick Access</h3>
              
              <nav className="space-y-2">
                {[
                  { icon: User, label: "My Profile", path: "/profile", gradient: "from-blue-500 to-blue-600" },
                  { icon: FileText, label: "Health Locker", path: "/health-locker", gradient: "from-green-500 to-green-600" },
                  { icon: Bot, label: "Ask AI", path: "/ask-ai", gradient: "from-purple-500 to-purple-600" },
                  { icon: Settings, label: "Settings", path: "/settings", gradient: "from-gray-500 to-gray-600" }
                ].map((item, index) => {
                  const IconComponent = item.icon;
                  return (
                    <button
                      key={index}
                      onClick={() => handleNavigation(item.path)}
                      className="w-full flex items-center gap-3 p-3 sm:p-4 text-left text-gray-700 hover:bg-gray-50 rounded-xl transition-all duration-200 group"
                    >
                      <div className={`p-2 bg-gradient-to-r ${item.gradient} rounded-lg`}>
                        <IconComponent className="w-5 h-5 text-white" />
                      </div>
                      <span className="font-medium flex-1">{item.label}</span>
                      <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" />
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Account Security */}
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-blue-200 rounded-lg">
                  <Shield className="w-6 h-6 text-blue-700" />
                </div>
                <h3 className="font-bold text-blue-900">Secure & Private</h3>
              </div>
              <p className="text-sm text-blue-800 mb-4">
                Your health data is encrypted and protected with industry-standard security.
              </p>
              <div className="flex items-center gap-2 text-blue-700">
                <CheckCircle className="w-4 h-4" />
                <span className="text-sm font-medium">Verified & Protected</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}