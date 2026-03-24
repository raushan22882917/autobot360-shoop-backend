import { supabaseAdmin } from '../../config/supabase';
import { HttpError, handleSupabaseError, assertFound } from '../../utils/errors';
import { enforcePlanLimit } from '../../middleware/planEnforcement';
import { deleteImage } from './storageService';

export async function createProduct(userId: string, data: {
  shop_id: string;
  name: string;
  price: number;
  description?: string;
  stock_quantity?: number;
  low_stock_threshold?: number;
}) {
  if (data.price <= 0) {
    throw new HttpError(422, 'INVALID_PRICE', 'Price must be greater than 0');
  }

  await enforcePlanLimit(userId, 'product_count', supabaseAdmin, data.shop_id);

  const { data: product, error } = await supabaseAdmin
    .from('products')
    .insert({
      ...data,
      out_of_stock: (data.stock_quantity ?? 0) === 0 ? false : false,
    })
    .select()
    .single();

  if (error) handleSupabaseError(error);
  return product;
}

export async function listProducts(shopId: string) {
  const { data, error } = await supabaseAdmin
    .from('products')
    .select('*')
    .eq('shop_id', shopId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) handleSupabaseError(error);
  return data ?? [];
}

export async function getProduct(productId: string) {
  const { data, error } = await supabaseAdmin
    .from('products')
    .select('*')
    .eq('id', productId)
    .single();

  if (error) handleSupabaseError(error);
  return assertFound(data, 'Product');
}

export async function updateProduct(productId: string, userId: string, data: Partial<{
  name: string;
  price: number;
  description: string;
  stock_quantity: number;
  low_stock_threshold: number;
  is_active: boolean;
}>) {
  if (data.price !== undefined && data.price <= 0) {
    throw new HttpError(422, 'INVALID_PRICE', 'Price must be greater than 0');
  }

  // Compute out_of_stock flag if stock_quantity is being updated
  const updates: Record<string, unknown> = { ...data, updated_at: new Date().toISOString() };
  if (data.stock_quantity !== undefined) {
    updates.out_of_stock = data.stock_quantity === 0;
  }

  // Verify ownership via shop
  const { data: existing } = await supabaseAdmin
    .from('products')
    .select('shop_id')
    .eq('id', productId)
    .single();

  if (!existing) throw new HttpError(404, 'NOT_FOUND', 'Product not found');

  const { data: shop } = await supabaseAdmin
    .from('shops')
    .select('id')
    .eq('id', existing.shop_id)
    .eq('user_id', userId)
    .single();

  if (!shop) throw new HttpError(403, 'FORBIDDEN', 'Access denied');

  const { data: product, error } = await supabaseAdmin
    .from('products')
    .update(updates)
    .eq('id', productId)
    .select()
    .single();

  if (error) handleSupabaseError(error);
  return assertFound(product, 'Product');
}

export async function deleteProduct(productId: string, userId: string) {
  const { data: product } = await supabaseAdmin
    .from('products')
    .select('shop_id, image_storage_path')
    .eq('id', productId)
    .single();

  if (!product) throw new HttpError(404, 'NOT_FOUND', 'Product not found');

  const { data: shop } = await supabaseAdmin
    .from('shops')
    .select('id')
    .eq('id', product.shop_id)
    .eq('user_id', userId)
    .single();

  if (!shop) throw new HttpError(403, 'FORBIDDEN', 'Access denied');

  if (product.image_storage_path) {
    await deleteImage(product.image_storage_path);
  }

  const { error } = await supabaseAdmin.from('products').delete().eq('id', productId);
  if (error) handleSupabaseError(error);
}

export async function attachImage(productId: string, imageUrl: string, storagePath: string) {
  const { data, error } = await supabaseAdmin
    .from('products')
    .update({ image_url: imageUrl, image_storage_path: storagePath, updated_at: new Date().toISOString() })
    .eq('id', productId)
    .select()
    .single();

  if (error) handleSupabaseError(error);
  return data;
}

export async function decrementStock(productId: string): Promise<{
  newStock: number;
  threshold: number;
  outOfStock: boolean;
}> {
  const { data: product } = await supabaseAdmin
    .from('products')
    .select('stock_quantity, low_stock_threshold')
    .eq('id', productId)
    .single();

  if (!product) throw new HttpError(404, 'NOT_FOUND', 'Product not found');

  const newStock = Math.max(0, product.stock_quantity - 1);
  const outOfStock = newStock === 0;

  await supabaseAdmin
    .from('products')
    .update({ stock_quantity: newStock, out_of_stock: outOfStock, updated_at: new Date().toISOString() })
    .eq('id', productId);

  return { newStock, threshold: product.low_stock_threshold, outOfStock };
}
