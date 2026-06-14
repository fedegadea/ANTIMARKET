export type Rol = 'comprador' | 'marca' | 'admin'
export type EstadoVerificacion = 'pendiente' | 'aprobada' | 'rechazada'
export type SuscripcionEstado = 'activa' | 'inactiva' | 'trial' | 'suspendida'
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
  banner_url: string | null
  color_acento: string | null
  descripcion: string | null
  instagram: string | null
  sitio_web: string | null
  categorias: string[]
  estado_verificacion: EstadoVerificacion
  suscripcion_estado: SuscripcionEstado
  destacada: boolean
  created_at: string
}

export interface Item {
  id: string
  brand_id: string
  nombre: string
  descripcion: string | null
  imagen_url: string | null
  link_saliente: string | null
  orden: number
  activo: boolean
  created_at: string
  brands?: Pick<Brand, 'nombre' | 'slug' | 'logo_url' | 'estado_verificacion'>
}

export interface News {
  id: string
  brand_id: string
  titulo: string
  contenido: string | null
  imagen_url: string | null
  activa: boolean
  created_at: string
}

export interface EmailSubscriber {
  id: string
  email: string
  created_at: string
}

export interface OutboundClick {
  id: string
  item_id: string | null
  brand_id: string | null
  created_at: string
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
