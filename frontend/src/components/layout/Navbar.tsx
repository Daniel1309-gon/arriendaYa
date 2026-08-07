import { useAuth } from '../../lib/AuthContext';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button';

export function Navbar() {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <nav className={`fixed top-0 w-full z-50 flex justify-between items-center px-4 md:px-16 transition-all duration-300 ease-in-out ${scrolled ? 'h-16 bg-white/95 shadow-sm backdrop-blur-md' : 'h-20 bg-white/80 backdrop-blur-md'}`}>
      <div className="flex items-center gap-2">
        <Link to="/" className="text-2xl font-bold text-emerald-700 tracking-tight no-underline">
          Rentia
        </Link>
      </div>

      <div className="hidden md:flex items-center gap-8">
        <Link to="/inmuebles" className="text-slate-600 hover:text-emerald-700 transition-colors text-sm font-medium no-underline">
          Explorar
        </Link>

        {isAuthenticated ? (
          <>
            <Link to="/perfil" className="text-slate-600 hover:text-emerald-700 transition-colors text-sm font-medium no-underline">
              Mi Perfil
            </Link>
            <span className="text-slate-400 text-sm font-medium">
              {user?.email}
            </span>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              Cerrar sesión
            </Button>
          </>
        ) : (
          <Link to="/login" className="no-underline">
            <Button variant="primary" size="sm">
              Iniciar Sesión
            </Button>
          </Link>
        )}
      </div>

      <button className="md:hidden p-2 text-emerald-700 focus:outline-none cursor-pointer bg-transparent border-none">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
      </button>
    </nav>
  );
}
