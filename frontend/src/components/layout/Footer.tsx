

export function Footer() {
  return (
    <footer className="w-full py-10 px-4 md:px-16 border-t border-slate-200 bg-white flex flex-col md:flex-row justify-between items-center gap-6">
      <div className="flex flex-col items-center md:items-start gap-1">
        <span className="text-xl font-bold text-emerald-700">ArriendaYa</span>
        <p className="text-sm text-slate-500">© {new Date().getFullYear()} ArriendaYa. Todos los derechos reservados.</p>
      </div>
      <div className="flex gap-8 flex-wrap justify-center">
        <a className="text-sm font-medium text-slate-500 hover:text-emerald-700 transition-all" href="#">Privacidad</a>
        <a className="text-sm font-medium text-slate-500 hover:text-emerald-700 transition-all" href="#">Términos</a>
        <a className="text-sm font-medium text-slate-500 hover:text-emerald-700 transition-all" href="#">Mapa del Sitio</a>
        <a className="text-sm font-medium text-slate-500 hover:text-emerald-700 transition-all" href="#">Ayuda</a>
      </div>
    </footer>
  );
}
