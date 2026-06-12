import Link from 'next/link'
import type { Product } from '@/lib/types'

interface ProductCardProps {
  product: Product
}

function formatPrice(precio: number, moneda: string) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: moneda, minimumFractionDigits: 0 }).format(precio)
}

export function ProductCard({ product }: ProductCardProps) {
  const img = product.imagenes?.[0]

  return (
    <Link
      href={`/productos/${product.id}`}
      className="group block border border-white/8 hover:border-white/20 transition-colors duration-300 bg-neutral-950 hover:bg-neutral-900"
    >
      <div className="aspect-square bg-neutral-900 overflow-hidden flex items-center justify-center">
        {img ? (
          <img
            src={img}
            alt={product.nombre}
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
          />
        ) : (
          <span className="text-white/10 text-4xl font-black">?</span>
        )}
      </div>
      <div className="p-3 border-t border-white/8">
        <p className="text-xs text-white/40 mb-0.5 truncate">{product.brands?.nombre}</p>
        <h4 className="text-sm font-medium leading-snug line-clamp-2">{product.nombre}</h4>
        <p className="mt-2 text-sm font-semibold tabular-nums">
          {formatPrice(product.precio, product.moneda)}
        </p>
      </div>
    </Link>
  )
}
