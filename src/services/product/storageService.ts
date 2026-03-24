import { supabaseAdmin } from '../../config/supabase';
import { HttpError } from '../../utils/errors';
import { v4 as uuidv4 } from 'uuid';
import type { MultipartFile } from '@fastify/multipart';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const BUCKET = 'product-images';

export async function uploadImage(file: MultipartFile, userId: string): Promise<{
  url: string;
  storagePath: string;
}> {
  const buffer = await file.toBuffer();

  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    throw new HttpError(422, 'INVALID_FILE_TYPE', 'Only JPEG, PNG, and WebP images are allowed');
  }

  if (buffer.length > MAX_FILE_SIZE) {
    throw new HttpError(422, 'FILE_TOO_LARGE', 'Image must be smaller than 5 MB');
  }

  const ext = file.mimetype.split('/')[1].replace('jpeg', 'jpg');
  const filename = `${uuidv4()}.${ext}`;
  const storagePath = `${userId}/${filename}`;

  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (error) {
    throw new HttpError(502, 'STORAGE_ERROR', `Failed to upload image: ${error.message}`);
  }

  const { data: urlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(storagePath);

  return { url: urlData.publicUrl, storagePath };
}

export async function deleteImage(storagePath: string): Promise<void> {
  const { error } = await supabaseAdmin.storage.from(BUCKET).remove([storagePath]);
  if (error) {
    console.error('Failed to delete image from storage:', error.message);
    // Non-fatal — log and continue
  }
}
