<?php
// Markings routes. Per-customer directory of stamp/engraving images.
// The uploaded image (sent as a base64 data URL) is written to a file under
// /uploads/markings and `src` stores its root-relative URL.

function markings_to_wire($row)
{
    return [
        'id'         => (int) $row['id'],
        'customerId' => $row['customer_id'],
        'name'       => $row['name'],
        'src'        => $row['src'] ?? '',
        'location'   => $row['location'] ?? '',
        'createdAt'  => to_iso($row['created_at']),
        'updatedAt'  => to_iso($row['updated_at']),
        'deletedAt'  => to_iso($row['deleted_at']),
    ];
}

// Root-relative URL prefix the API is served under (e.g. "/api").
// Absolute base URL for uploaded media. The front-end is served from a
// different origin (platform.samanpoolak.ir) than the API, so image URLs must
// be absolute (scheme + host) — a root-relative "/uploads/..." would resolve
// against the front-end origin and 404.
function media_url_base()
{
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    $scheme = $https ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? '';
    $base = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');
    return $scheme . '://' . $host . $base;
}

// Decode a base64 data URL, write it to /uploads/markings, return its URL.
function save_marking_image($customerId, $dataUrl)
{
    if (!is_string($dataUrl) || strpos($dataUrl, 'data:') !== 0) {
        return '';
    }
    if (!preg_match('#^data:image/([a-zA-Z0-9.+-]+);base64,(.+)$#s', $dataUrl, $m)) {
        json_error('Unsupported image format', 422);
    }
    $ext = strtolower($m[1]);
    $ext = $ext === 'jpeg' ? 'jpg' : preg_replace('/[^a-z0-9]/', '', $ext);
    $bytes = base64_decode($m[2], true);
    if ($bytes === false) {
        json_error('Invalid image data', 422);
    }

    $dir = dirname(__DIR__) . '/uploads/markings';
    if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
        json_error('Cannot create upload directory', 500);
    }
    $safeCustomer = preg_replace('/[^A-Za-z0-9_-]/', '', (string) $customerId);
    $file = 'm_' . $safeCustomer . '_' . bin2hex(random_bytes(6)) . '.' . $ext;
    if (file_put_contents($dir . '/' . $file, $bytes) === false) {
        json_error('Failed to save image', 500);
    }
    return media_url_base() . '/uploads/markings/' . $file;
}

// GET /markings?updatedAfter=<iso>
function markings_list($params, $body, $user)
{
    $after = $_GET['updatedAfter'] ?? null;
    if ($after) {
        $ts = from_iso($after);
        if ($ts === null) {
            json_error('Invalid updatedAfter timestamp', 422);
        }
        $stmt = db()->prepare('SELECT * FROM markings WHERE updated_at > :ts ORDER BY updated_at ASC');
        $stmt->execute([':ts' => $ts]);
    } else {
        $stmt = db()->query('SELECT * FROM markings WHERE deleted_at IS NULL ORDER BY id ASC');
    }
    json_response(['markings' => array_map('markings_to_wire', $stmt->fetchAll())]);
}

// POST /markings  { customerId, name, location?, imageData? }
// Names are auto-numerated per customer to stay unique (name.jpeg -> name-2.jpeg).
function markings_create($params, $body, $user)
{
    require_fields($body, ['customerId', 'name']);
    $customerId = (string) $body['customerId'];
    $name = trim((string) $body['name']);

    // Unique-per-customer name (only consider non-deleted rows).
    $stmt = db()->prepare('SELECT name FROM markings WHERE customer_id = :c AND deleted_at IS NULL');
    $stmt->execute([':c' => $customerId]);
    $taken = array_column($stmt->fetchAll(), 'name');
    if (in_array($name, $taken, true)) {
        $dot = strrpos($name, '.');
        $base = $dot > 0 ? substr($name, 0, $dot) : $name;
        $ext  = $dot > 0 ? substr($name, $dot) : '';
        $n = 2;
        while (in_array("$base-$n$ext", $taken, true)) {
            $n++;
        }
        $name = "$base-$n$ext";
    }

    $src = isset($body['imageData']) ? save_marking_image($customerId, $body['imageData']) : '';
    $now = now_utc();

    // Distinct placeholders for created_by/updated_by — native prepared
    // statements (EMULATE_PREPARES=false) forbid reusing one named param twice.
    $stmt = db()->prepare(
        'INSERT INTO markings (customer_id, name, src, location, created_by, updated_by, created_at, updated_at)
         VALUES (:c, :n, :s, :l, :cb, :ub, :ca, :ua)'
    );
    $stmt->execute([
        ':c' => $customerId, ':n' => $name, ':s' => $src,
        ':l' => trim((string) ($body['location'] ?? '')),
        ':cb' => $user['id'], ':ub' => $user['id'], ':ca' => $now, ':ua' => $now,
    ]);
    $id = (int) db()->lastInsertId();

    $stmt = db()->prepare('SELECT * FROM markings WHERE id = :id');
    $stmt->execute([':id' => $id]);
    json_response(['marking' => markings_to_wire($stmt->fetch())], 201);
}

// DELETE /markings/{id}  -> soft delete
function markings_delete($params, $body, $user)
{
    $id = $params['id'];
    $now = now_utc();
    $stmt = db()->prepare(
        'UPDATE markings SET deleted_at = :d, updated_at = :u, updated_by = :by WHERE id = :id AND deleted_at IS NULL'
    );
    $stmt->execute([':d' => $now, ':u' => $now, ':by' => $user['id'], ':id' => $id]);
    if ($stmt->rowCount() === 0) {
        json_error('Marking not found', 404);
    }
    json_response(['ok' => true, 'id' => (int) $id]);
}
