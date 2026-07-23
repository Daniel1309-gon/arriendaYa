import { Navbar } from '../components/layout/Navbar';
import { Footer } from '../components/layout/Footer';
import { SearchField } from '../components/ui/SearchField';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { ZoneCard } from '../components/ZoneCard';
import { useState } from 'react';

export default function HomePage() {
  const [inmuebleType, setInmuebleType] = useState('apartamento');
  
  const zones = [
    {
      name: 'Chapinero',
      subtitle: 'Vibrante & Central',
      propertyCount: 1240,
      imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD5e3pINclRoWwIVymhX_S1yhKOmR4A1aiXjBWlqSR1Qf3Q-RHHHNz-Gfu7L787lJudF7zgo8TOKeC__rzq7MidiWm22Cnjc8nCDGQd-N16shC7Q9aNJpIA8uJxdZ4MDpKf-HlpJjU9fhFcKqosLbTGE3x698l6XT-x3qX48x2cGlEEGDVK4oI7bGn23kx3Xq6W-h3g80S-fiIXbMR5wvQrXAmX4jcgGfB1KpjPqpyI50d9Wros9vlOzw',
      delayMs: 100
    },
    {
      name: 'Usaquén',
      subtitle: 'Elegancia & Tradición',
      propertyCount: 850,
      imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBUg42Vp31BTaxWAIXJnC3GvZJwiPtchfgUP5iZuKlRWE9ygwBk5gnc_89b7kpgKNl_1oX7mZYvLXzv8ufzPxEPqiazKjDfASr7J7s78pFn1xxOQKHCxs4XSvSpUJ4gH5paiophx3bNO8cpdEaf4_bd_s6Ie3b7duvyVi8bUdxBUqA1i9ur4TsdMdhCXtptQRNQCCs-acw6Der_XNaz_tiFWxPwv9wZFgVoQrDdSaazZcJ93pxDWebwZQ',
      delayMs: 200
    },
    {
      name: 'Cedritos',
      subtitle: 'Residencial & Familiar',
      propertyCount: 2105,
      imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDi1TaIns7Gn14agMBhAz48gqpgxzziXNqOThpe-FIYzes6xV4eL6k3Q3nvgH2_2xwzJBMhrKrh5Hk-yvz-3pDw3DdKKJLUEzb-hM4znJLTFxt1Z2taIN9yy-GMUqGdYmqImZz-4psLeOG1y-y-S-KLlnZd1zJge3_4MdS5Oa5CPwdw8cBU1tojEfGD_ntoOzldSQT1Zej_DCb7rG2AxE4a5ZJQnQUJH07BCuL5pVu0ToDkBRnu6iDCMg',
      delayMs: 300
    }
  ];

  return (
    <div className="bg-slate-50 font-sans text-slate-900 min-h-screen">
      <Navbar />

      <main className="pt-0">
        {/* Hero Section */}
        <section className="relative h-[75vh] min-h-125 max-h-200 w-full flex items-center justify-center overflow-hidden mt-16 md:mt-20">
          <div 
            className="absolute inset-0 bg-cover bg-center" 
            style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuBaK_Ba847TIc7WofdNnB5ZqTu1MCRSlUGoPuj9pq4sSJiNdyODG4KRLL9giDPT4ebmdX9iBg25ZXVOeCpRys8ti7sbFHUW7YZ77kaHMrGN-CPF1gW2bb3k5UIHlheqs-KvOKIJPR6rHMeb0OROiSiC0UcMjHh5vo6AZiGRvkADb0qXxLR3V7yrPkAyv_4v3DHjBvycR2zaJiuhcnv_MLM3FyZrhpoZ4QMvAivkwaSDe14FqmcWs2IeNg')" }}
          >
            <div className="absolute inset-0 bg-black/40 bg-linear-to-b from-black/30 via-transparent to-black/50"></div>
          </div>
          
          <div className="relative z-10 w-full max-w-5xl px-4 text-center animate-fade-in-up">
            <h1 className="text-4xl md:text-6xl font-bold text-white mb-8 drop-shadow-lg tracking-tight">
              Tu próximo hogar en Bogotá empieza aquí
            </h1>
            
            {/* Search Bar Container */}
            <div className="bg-white/85 backdrop-blur-md p-2 md:p-3 rounded-2xl md:rounded-full shadow-2xl flex flex-col md:flex-row items-center gap-2 md:gap-4 max-w-4xl mx-auto border border-white/40 animate-zoom-in" style={{ animationDelay: '200ms' }}>
              
              <SearchField 
                label="Barrio o Zona" 
                icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.243-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>}
                className="border-b md:border-b-0 md:border-r border-slate-300/50 md:w-1/3"
              >
                <input className="w-full bg-transparent border-none p-0 text-slate-900 placeholder:text-slate-400 focus:ring-0 text-sm font-medium outline-none" placeholder="¿Dónde quieres vivir?" type="text" />
              </SearchField>

              <SearchField 
                label="Inmueble" 
                icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>}
                className="border-b md:border-b-0 md:border-r border-slate-300/50 md:w-1/4 relative"
              >
                <Select 
                  value={inmuebleType}
                  onChange={setInmuebleType}
                  options={[
                    { value: 'apartamento', label: 'Apartamento' },
                    { value: 'casa', label: 'Casa' },
                    { value: 'oficina', label: 'Oficina' },
                    { value: 'local', label: 'Local Comercial' }
                  ]}
                />
              </SearchField>
              
              <SearchField 
                label="Presupuesto" 
                icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>}
                className="md:w-1/4"
              >
                <input className="w-full bg-transparent border-none p-0 text-slate-900 placeholder:text-slate-400 focus:ring-0 text-sm font-medium outline-none" placeholder="Precio máx." type="text" />
              </SearchField>
              
              <Button variant="primary" className="w-full md:w-auto px-8 rounded-xl md:rounded-full">
                <svg className="w-5 h-5 hidden md:block mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                <span>Buscar</span>
              </Button>
            </div>
          </div>
        </section>

        {/* Featured Zones Section */}
        <section className="py-20 px-4 md:px-16 max-w-screen-2xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-4 animate-fade-in-up">
            <div className="max-w-xl">
              <h2 className="text-3xl font-bold text-slate-900 mb-2">Zonas Destacadas</h2>
              <p className="text-slate-600 text-lg">Explora los barrios más vibrantes y buscados de la capital colombiana.</p>
            </div>
            <a className="text-emerald-700 font-bold flex items-center gap-1 hover:underline decoration-2 underline-offset-4" href="#">
              Ver todos los barrios
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path></svg>
            </a>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {zones.map((zone, idx) => (
              <ZoneCard key={idx} {...zone} />
            ))}
          </div>
        </section>

        {/* Newsletter Section */}
        <section className="bg-emerald-900 text-white py-20 px-4 text-center">
          <div className="max-w-2xl mx-auto animate-zoom-in">
            <svg className="w-16 h-16 mx-auto mb-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Recibe las mejores ofertas</h2>
            <p className="text-emerald-100 text-lg mb-10">Suscríbete a nuestro boletín para conocer los nuevos lanzamientos en tus zonas preferidas antes que nadie.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
              <input className="flex-1 bg-white/10 border border-emerald-700 px-6 py-4 rounded-xl focus:ring-2 focus:ring-emerald-400 outline-none text-white placeholder:text-emerald-300 font-medium" placeholder="Tu correo electrónico" type="email" />
              <Button variant="accent" size="lg" className="w-full sm:w-auto">
                Unirme
              </Button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
