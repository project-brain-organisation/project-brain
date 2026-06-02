import './Login.css';

const API_URL = import.meta.env.VITE_API_URL || '';

export function Login() {
  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo" />
        <h1 className="login-title">Project Brain</h1>
        <p className="login-subtitle">Capture notes fast. Organise later.</p>
        <a href={`${API_URL}/api/auth/google`} className="login-btn">
          Sign in with Google
        </a>
      </div>
    </div>
  );
}
