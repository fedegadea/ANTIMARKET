export type Rol = 'comprador' | 'marca' | 'admin'
export type EstadoVerificacion = 'pendiente' | 'aprobada' | 'rechazada'
export type SuscripcionEstado = 'activa' | 'inactiva' | 'trial' | 'suspendida'
export type EstadoOrden = 'pendiente' | 'confirmada' | 'enviada' | 'entregada'
export type EstadoVerifReq = 'pendiente' | 'aprobada' | 'rechazada'

export interface Profile {
  id: string
  nombre: string | null
  email: string | null
  rol: Rol
  created_at: string
}

export interface Brand {
  id: string
  user_id: string
  nombre: string
  slug: string
  logo_url: string | null
  descripcion: string | null
  instagram: string | null
  sitio_web: string | null
  categorias: string[]
  estado_verificacion: EstadoVerificacion
  suscripcion_estado: SuscripcionEstado
  destacada: boolean
  created_at: string
}

export interface Product {
  id: string
  brand_id: string
  nombre: string
  descripcion: string | null
  precio: number
  moneda: string
  imagenes: string[]
  stock: number
  categoria: string | null
  activo: boolean
  created_at: string
  brands?: Pick<Brand, 'nombre' | 'slug' | 'logo_url' | 'estado_verificacion'>
}

export interface Order {
  id: string
  product_id: string
  brand_id: string
  comprador_id: string
  cantidad: number
  total: number
  estado: EstadoOrden
  datos_envio: Record<string, string>
  notas: string | null
  created_at: string
  products?: Pick<Product, 'nombre' | 'imagenes'>
  brands?: Pick<Brand, 'nombre' | 'slug'>
}

export interface VerificationRequest {
  id: string
  brand_id: string
  estado: EstadoVerifReq
  notas_admin: string | null
  fecha_solicitud: string
  fecha_resolucion: string | null
  brands?: Brand
}
