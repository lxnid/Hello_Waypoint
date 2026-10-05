/**
 * Consistent ID formatters across all workspaces.
 * Converts raw UUIDs into readable, identifiable formatted identifiers
 * with standard prefixes (ORD-, LDS-, VEH-, STR-, ITM-, ISS-, CLS-).
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RAW_HEX_32 = /^[0-9a-f]{32}$/i;

export function isUuid(str?: string | null): boolean {
  if (!str) return false;
  return UUID_REGEX.test(str.trim()) || RAW_HEX_32.test(str.trim());
}

export function shortId(str?: string | null, length = 6): string {
  if (!str) return '000000';
  const clean = str.replace(/[^a-zA-Z0-9]/g, '');
  return clean.slice(0, length).toUpperCase() || '000000';
}

/**
 * Formats an order reference or order ID into a consistent ORD-XXXXXX format.
 * If a custom public reference already exists (e.g. UI-FRESH-001, DEMO-001), it is preserved.
 * If public reference contains a raw UUID (e.g. ORD-550e8400...), it is shortened.
 */
export function formatOrderId(publicReference?: string | null, orderId?: string | null): string {
  const ref = (publicReference || orderId || '').trim();
  if (!ref) return 'ORD-UNKNOWN';

  // Check if reference is just a raw UUID
  if (isUuid(ref)) {
    return `ORD-${shortId(ref)}`;
  }

  // Check if it's ORD- followed by a raw UUID
  if (/^ORD-[0-9a-f]{8}-[0-9a-f]{4}/i.test(ref)) {
    return `ORD-${shortId(ref.slice(4))}`;
  }

  // If it already has an identifiable format like UI-..., DEMO-..., ORD-..., IMPORT-...
  if (/^[A-Z0-9]{2,8}-[A-Z0-9_-]+$/i.test(ref)) {
    return ref.toUpperCase();
  }

  return `ORD-${shortId(ref)}`;
}

/**
 * Formats a trip or load ID into LDS-XXXXXX format.
 */
export function formatLoadId(tripId?: string | null): string {
  const id = (tripId || '').trim();
  if (!id) return 'LDS-UNKNOWN';

  if (/^LDS-[0-9a-f]{8}-[0-9a-f]{4}/i.test(id)) {
    return `LDS-${shortId(id.slice(4))}`;
  }

  if (/^LDS-[A-Z0-9]{4,8}$/i.test(id)) {
    return id.toUpperCase();
  }

  return `LDS-${shortId(id)}`;
}

/**
 * Formats a vehicle ID into VEH-XXX format.
 */
export function formatVehicleId(vehicleId?: string | null): string {
  const id = (vehicleId || '').trim();
  if (!id) return 'VEH-UNKNOWN';

  // If already VEH001 or VEH-001
  const match = id.match(/^VEH-?([A-Z0-9]+)$/i);
  if (match && match[1]) {
    return `VEH-${match[1].toUpperCase()}`;
  }

  if (isUuid(id)) {
    return `VEH-${shortId(id)}`;
  }

  return `VEH-${id.toUpperCase()}`;
}

/**
 * Formats a store/outlet ID into STR-XXX format.
 */
export function formatStoreId(storeId?: string | null): string {
  const id = (storeId || '').trim();
  if (!id) return 'STR-UNKNOWN';

  const match = id.match(/^(OUT|STR)-?([A-Z0-9]+)$/i);
  if (match && match[2]) {
    return `STR-${match[2].toUpperCase()}`;
  }

  if (isUuid(id)) {
    return `STR-${shortId(id)}`;
  }

  return `STR-${shortId(id)}`;
}

/**
 * Formats an order item or product line ID into SKU or ITM-XXXXXX.
 */
export function formatItemId(
  sku?: string | null,
  productId?: string | null,
  lineId?: string | null,
): string {
  if (sku && !isUuid(sku)) {
    return sku;
  }
  const fallback = sku || productId || lineId || '';
  if (!fallback) return 'ITM-UNKNOWN';

  return `ITM-${shortId(fallback)}`;
}

/**
 * Formats an operational issue ID into ISS-XXXXXX.
 */
export function formatIssueId(issueId?: string | null): string {
  const id = (issueId || '').trim();
  if (!id) return 'ISS-UNKNOWN';

  if (/^ISS-[A-Z0-9]{4,8}$/i.test(id)) {
    return id.toUpperCase();
  }

  return `ISS-${shortId(id)}`;
}

/**
 * Formats a cluster ID into CLS-XXXXXX.
 */
export function formatClusterId(clusterId?: string | null): string {
  const id = (clusterId || '').trim();
  if (!id) return 'CLS-UNKNOWN';

  if (/^CLS-[A-Z0-9]{4,8}$/i.test(id)) {
    return id.toUpperCase();
  }

  return `CLS-${shortId(id)}`;
}
