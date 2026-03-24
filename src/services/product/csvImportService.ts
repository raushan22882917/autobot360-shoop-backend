import { parse } from 'csv-parse/sync';
import { supabaseAdmin } from '../../config/supabase';
import { HttpError } from '../../utils/errors';
import { PLAN_LIMITS } from '../../types';
import type { Plan } from '../../types';

const MAX_CSV_SIZE = 1 * 1024 * 1024; // 1 MB

interface CsvRow {
  name?: string;
  price?: string;
  description?: string;
  image_url?: string;
}

interface ImportResult {
  total: number;
  imported: number;
  failed: Array<{ row: number; error: string }>;
  plan_limit_reached: boolean;
}

export async function bulkImportProducts(
  shopId: string,
  userId: string,
  csvBuffer: Buffer
): Promise<ImportResult> {
  if (csvBuffer.length > MAX_CSV_SIZE) {
    throw new HttpError(422, 'FILE_TOO_LARGE', 'CSV file must be smaller than 1 MB');
  }

  // Get user plan and current product count
  const { data: user } = await supabaseAdmin.from('users').select('plan').eq('id', userId).single();
  const plan = (user?.plan ?? 'free') as Plan;
  const limits = PLAN_LIMITS[plan];

  const { count: currentCount } = await supabaseAdmin
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('shop_id', shopId)
    .eq('is_active', true);

  let remaining = limits.maxProducts - (currentCount ?? 0);

  let rows: CsvRow[];
  try {
    rows = parse(csvBuffer.toString('utf-8'), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  } catch {
    throw new HttpError(422, 'INVALID_CSV', 'Could not parse CSV file');
  }

  const result: ImportResult = {
    total: rows.length,
    imported: 0,
    failed: [],
    plan_limit_reached: false,
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // 1-indexed + header row

    if (remaining <= 0) {
      result.plan_limit_reached = true;
      result.failed.push({ row: rowNum, error: `Plan limit of ${limits.maxProducts} products reached` });
      continue;
    }

    if (!row.name || row.name.trim().length === 0) {
      result.failed.push({ row: rowNum, error: 'name is required' });
      continue;
    }

    const price = parseFloat(row.price ?? '');
    if (isNaN(price) || price <= 0) {
      result.failed.push({ row: rowNum, error: 'price must be a positive number' });
      continue;
    }

    const { error } = await supabaseAdmin.from('products').insert({
      shop_id: shopId,
      name: row.name.trim(),
      price,
      description: row.description?.trim() || null,
      image_url: row.image_url?.trim() || null,
    });

    if (error) {
      result.failed.push({ row: rowNum, error: error.message });
    } else {
      result.imported++;
      remaining--;
    }
  }

  return result;
}
