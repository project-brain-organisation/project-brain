import { NavLink } from 'react-router-dom';
import './TabBar.css';

const TABS = [
  {
    to: '/',
    label: 'Thoughts',
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="4" y1="6" x2="20" y2="6" />
        <line x1="4" y1="12" x2="20" y2="12" />
        <line x1="4" y1="18" x2="14" y2="18" />
      </svg>
    ),
  },
  {
    to: '/graph',
    label: 'Graph',
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="6" cy="6" r="2.5" />
        <circle cx="18" cy="9" r="2.5" />
        <circle cx="10" cy="18" r="2.5" />
        <line x1="8.2" y1="7" x2="15.8" y2="8.4" />
        <line x1="7" y1="8.2" x2="9.2" y2="15.8" />
        <line x1="16.4" y1="11" x2="11.6" y2="16.2" />
      </svg>
    ),
  },
];

/** Mobile bottom navigation bar (two peer destinations). */
export function TabBar() {
  return (
    <nav className="tab-bar">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === '/'}
          className={({ isActive }) => `tab-bar-item${isActive ? ' tab-bar-item--active' : ''}`}
        >
          <span className="tab-bar-icon">{tab.icon}</span>
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
