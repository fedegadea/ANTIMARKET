import Link from 'next/link'
import type { Brand } from '@/lib/types'
import { VerifiedBadge } from './VerifiedBadge'

interface BrandCardProps {
  brand: Brand
}

export function BrandCard({ brand }: BrandCardProps) {
  return (
    <Link
      href={`/marcas/${brand.slug}`}
      className="group block border border-white/8 hover:border-white/20 transition-colors duration-300 bg-neutral-950 hover:bg-neutral-900"
    >
      {/* Logo / cover */}
      <div className="aspect-[4/3] bg-neutral-900 flex items-center justify-center overflow-hidden">
        {brand.logo_url ? (
          <img
            src={brand.logo_url}
            alt={brand.nombre}
            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
          />
        ) : (
          <span className="text-5xl font-black text-white/10 tracking-tighter select-none">
            {brand.nombre[0].toUpperCase()}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-4 border-t border-white/8">
        <div className="flex items-start justify-between gap-3 mb-1.5">
          <h3 className="font-semibold text-sm tracking-wide truncate">{brand.nombre}</h3>
          {brand.estado_verificacion === 'aprobada' && <VerifiedBadge small />}
        </div>
        {brand.descripcion && (
          <p className="text-xs text-white/40 line-clamp-2 leading-relaxed">{brand.descripcion}</p>
        )}
        {brand.categorias?.length > 0 && (
          <p className="mt-2 text-[10px] text-white/25 uppercase tracking-widest">
            {brand.categorias.slice(0, 2).join(' · ')}
          </p>
        )}
      </div>
    </Link>
  )
}
