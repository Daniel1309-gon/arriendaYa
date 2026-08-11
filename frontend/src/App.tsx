import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import PerfilPage from './pages/PerfilPage';
import InmueblesListadoPage from './pages/InmueblesListadoPage';
import InmuebleDetailPage from './pages/InmuebleDetailPage';
import InmuebleFormPage from './pages/InmuebleFormPage';
import MisInmueblesPage from './pages/MisInmueblesPage';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/perfil" element={<PerfilPage />} />
        <Route path="/inmuebles" element={<InmueblesListadoPage />} />
        <Route path="/inmuebles/nuevo" element={<InmuebleFormPage />} />
        <Route path="/inmuebles/:id/editar" element={<InmuebleFormPage />} />
        <Route path="/inmuebles/:id" element={<InmuebleDetailPage />} />
        <Route path="/mis-inmuebles" element={<MisInmueblesPage />} />
      </Routes>
    </Router>
  );
}

export default App;
