import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Shell } from './components/Shell';
import { HomePage } from './components/HomePage';
import { SelectedRootProvider } from './contexts/SelectedRootContext';

export default function App() {
  return (
    <SelectedRootProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route path="/" element={<HomePage />} />
            {/* Mobile Graph tab; on desktop it renders the same two-pane view */}
            <Route path="/graph" element={<HomePage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SelectedRootProvider>
  );
}
