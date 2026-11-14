<?php
declare(strict_types=1);

/*
 * Shared helpers: config, database, sessions, JSON replies, validation.
 * This file sits in private/src/, outside public_html, so browsers cannot download it.
 */

const DEFAULT_WEEK = [
    ['08:00', '15:30'], ['08:00', '15:30'], ['08:00', '15:30'], ['08:00', '15:30'], ['08:00', '15:30'],
    ['', ''], ['', ''],   // Mon..Fri working, Sat and Sun off
];

function cfg(): array
{
    static $c = null;
    if ($c === null) {
        $c = require __DIR__ . '/../config.php';
    }
    return $c;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $d = cfg()['db'];
        $dsn = 'mysql:host=' . $d['host'] . ';dbname=' . $d['name'] . ';charset=utf8mb4';
        $pdo = new PDO($dsn, $d['user'], $d['pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    }
    return $pdo;
}

/*
 * v3.2: Jaguar keeps its own sessions.
 * - Session files live in private/sessions/ (not the hosting account's shared folder), so the cPanel
 *   clean-up job and other apps on the same account (Coyote) cannot delete them.
 * - A session lasts session_hours (config, default 12) since the last request, and survives closing the browser.
 * - The cookie only belongs to /azteca/jaguar/, so other apps on nahuatl.greenpointengineering.ca cannot clash with it.
 */
function start_session(): void
{
    $c = cfg();
    $hours = (float) ($c['session_hours'] ?? 12);
    $life = max(900, (int) round($hours * 3600));
    $path = (string) ($c['cookie_path'] ?? '/azteca/jaguar/');

    $dir = __DIR__ . '/../sessions';
    if (!is_dir($dir)) {
        @mkdir($dir, 0700, true);
    }
    if (is_dir($dir) && is_writable($dir)) {
        session_save_path($dir);
        ini_set('session.gc_probability', '1');
        ini_set('session.gc_divisor', '100');
    }
    ini_set('session.gc_maxlifetime', (string) $life);
    ini_set('session.use_strict_mode', '1');

    session_name('jaguar_sess');
    session_set_cookie_params([
        'lifetime' => $life,
        'path' => $path,
        'secure' => (bool) $c['secure_cookies'],
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();

    // Sliding expiry: every request pushes the cookie's end time forward.
    setcookie(session_name(), session_id(), [
        'expires' => time() + $life,
        'path' => $path,
        'secure' => (bool) $c['secure_cookies'],
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function json_out($data, int $code = 200): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function fail(string $message, int $code = 400, array $extra = []): void
{
    json_out(array_merge(['error' => $message], $extra), $code);
}

function body(): array
{
    $raw = file_get_contents('php://input') ?: '';
    if ($raw === '') {
        return [];
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        fail('Invalid request data.');
    }
    return $data;
}

function need_post(): void
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        fail('POST required.', 405);
    }
}

function clean_str($value, int $max): string
{
    return mb_substr(trim((string) ($value ?? '')), 0, $max, 'UTF-8');
}

/** 'HH:MM' or '' when empty; false when not a valid time. */
function norm_time($value)
{
    $s = trim((string) ($value ?? ''));
    if ($s === '') {
        return '';
    }
    return preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $s) ? $s : false;
}

/** 'YYYY-MM-DD', null when empty, false when not a real date. */
function norm_date($value)
{
    $s = trim((string) ($value ?? ''));
    if ($s === '') {
        return null;
    }
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $s, $m) || !checkdate((int) $m[2], (int) $m[3], (int) $m[1])) {
        return false;
    }
    return $s;
}

/**
 * Date with an optional 24-hour time: 'YYYY-MM-DD' or 'YYYY-MM-DD HH:MM'.
 * Returns [date, time] (time 'HH:MM:00' or null; both null when empty), or false when invalid.
 */
function norm_datetime($value)
{
    $s = trim((string) ($value ?? ''));
    if ($s === '') {
        return [null, null];
    }
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/', $s, $m)
        || !checkdate((int) $m[2], (int) $m[3], (int) $m[1])) {
        return false;
    }
    if (!isset($m[4])) {
        return [substr($s, 0, 10), null];
    }
    if ((int) $m[4] > 23 || (int) $m[5] > 59) {
        return false;
    }
    return [substr($s, 0, 10), $m[4] . ':' . $m[5] . ':00'];
}

function csrf_token(): string
{
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

function check_csrf(): void
{
    $sent = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    $real = (string) ($_SESSION['csrf'] ?? '');
    if ($sent === '' || $real === '' || !hash_equals($real, $sent)) {
        fail('Your session token is out of date. Reload the page and try again.', 403);
    }
}

function current_user(): ?array
{
    if (empty($_SESSION['uid'])) {
        return null;
    }
    $st = db()->prepare(
        'SELECT u.id, u.tenant_id, u.email, u.name, u.role, t.name AS tenant_name
         FROM users u JOIN tenants t ON t.id = u.tenant_id
         WHERE u.id = ? AND u.active = 1'
    );
    $st->execute([(int) $_SESSION['uid']]);
    $u = $st->fetch();
    if (!$u) {
        end_session();
        return null;
    }
    return $u;
}

function require_user(): array
{
    $u = current_user();
    if (!$u) {
        fail('Please log in.', 401);
    }
    return $u;
}

function public_user(array $u): array
{
    return [
        'id' => (int) $u['id'],
        'name' => $u['name'],
        'email' => $u['email'],
        'role' => $u['role'],
        'tenant' => $u['tenant_name'],
    ];
}

function start_user_session(int $uid): void
{
    session_regenerate_id(true);
    $_SESSION['uid'] = $uid;
    unset($_SESSION['csrf']);
    json_out(['user' => public_user(current_user()), 'csrf' => csrf_token()]);
}

function end_session(): void
{
    $_SESSION = [];
    $p = session_get_cookie_params();
    setcookie(session_name(), '', [
        'expires' => time() - 42000,
        'path' => $p['path'],
        'secure' => $p['secure'],
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_destroy();
}

function email_taken(string $email): bool
{
    $st = db()->prepare('SELECT 1 FROM users WHERE email = ?');
    $st->execute([$email]);
    return (bool) $st->fetch();
}
