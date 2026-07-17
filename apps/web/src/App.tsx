import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Shell } from './components/Shell';
import { HomePage } from './components/HomePage';
import { OfflineBanner } from './components/OfflineBanner';
import { SelectedRootProvider } from './contexts/SelectedRootContext';

export default function App() {
  return (
    <SelectedRootProvider>
      <OfflineBanner />
      <BrowserRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route path="/" element={<HomePage />} />
            {/* The old mobile Graph tab route — the graph is a top sheet now */}
            <Route path="/graph" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SelectedRootProvider>
  );
}
