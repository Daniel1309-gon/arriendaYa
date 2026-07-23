

interface ZoneCardProps {
  name: string;
  subtitle: string;
  propertyCount: number;
  imageUrl: string;
  delayMs?: number;
}

export function ZoneCard({ name, subtitle, propertyCount, imageUrl, delayMs = 0 }: ZoneCardProps) {
  return (
    <div 
      className="group relative overflow-hidden rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 bg-white cursor-pointer animate-fade-in-up" 
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div className="aspect-[4/3] overflow-hidden">
        <div 
          className="w-full h-full bg-cover bg-center transition-transform duration-500 group-hover:scale-110" 
          style={{ backgroundImage: `url('${imageUrl}')` }}
        />
      </div>
      <div className="p-6 relative">
        <div className="flex justify-between items-start mb-2">
          <div>
            <h3 className="text-xl font-bold text-slate-900">{name}</h3>
            <p className="text-slate-500 text-sm mt-1">{subtitle}</p>
          </div>
          <span className="bg-emerald-50 text-emerald-800 px-3 py-1 rounded-full text-xs font-bold border border-emerald-100">
            {propertyCount.toLocaleString()} Inmuebles
          </span>
        </div>
      </div>
    </div>
  );
}
