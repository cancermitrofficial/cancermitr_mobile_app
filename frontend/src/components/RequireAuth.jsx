// src/components/RequireAuth.jsx
import { Navigate } from "react-router-dom";

function getCookie(name) {
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? match[2] : null;
}

export default function RequireAuth({ children }) {
  const token = getCookie("token");

  if (!token) {
    return <Navigate to="/" replace />;
  }

  return children;
}
