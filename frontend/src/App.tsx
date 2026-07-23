import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import PerfilPage from './pages/PerfilPage';
import InmueblesListadoPage from './pages/InmueblesListadoPage';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/perfil" element={<PerfilPage />} />
        <Route path="/inmuebles" element={<InmueblesListadoPage />} />
      </Routes>
    </Router>
  );
}

export default App;
