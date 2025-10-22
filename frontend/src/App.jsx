import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import Dashboard from "./pages/dashboard/Dashboard";
import RequireAuth from "./components/RequireAuth";
import Chat from "./pages/dashboard/Chat";
import HealthLocker from "./pages/healthlocker/HealthLocker";
import Profile from "./pages/profile/Profile";

function App() {
  return (
    
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <Dashboard />
            </RequireAuth>
          }
        />
        <Route 
          path="/ask-ai"
          element={
          <RequireAuth>
            <Chat />
          </RequireAuth>
        }
        />
        <Route
          path="/health-locker"
          element={
            <RequireAuth>
              <HealthLocker />
            </RequireAuth>
          }
        />
        <Route
          path="/profile"
          element={
            <RequireAuth>
              <Profile />
            </RequireAuth>
          }
        />
      </Routes>
    
  );
}

export default App;
