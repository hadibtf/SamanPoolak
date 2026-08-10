<?php
// Public careers applications plus authenticated back-office management.

const JOB_APPLICATION_STATUSES = [
    'new',
    'interview',
    'accepted',
    'rejected',
];

const JOB_APPLICATIONS_SELECT = 'SELECT * FROM job_applications';
const HIRING_OPEN_KEY = 'jobs_hiring_open';

function job_applications_hiring_open()
{
    $stmt = db()->prepare('SELECT value FROM app_settings WHERE name = :name LIMIT 1');
    $stmt->execute([':name' => HIRING_OPEN_KEY]);
    $row = $stmt->fetch();
    if (!$row) {
        return true;
    }
    return $row['value'] !== '0';
}

function job_applications_hiring_status($params, $body, $user)
{
    json_response(['open' => job_applications_hiring_open()]);
}

function job_applications_hiring_update($params, $body, $user)
{
    $open = !empty($body['open']);
    $stmt = db()->prepare(
        'INSERT INTO app_settings (name, value, updated_at) VALUES (:name, :value, :updated_at)
         ON DUPLICATE KEY UPDATE value = :update_value, updated_at = :update_updated_at'
    );
    $now = now_utc();
    $stmt->execute([
        ':name' => HIRING_OPEN_KEY,
        ':value' => $open ? '1' : '0',
        ':updated_at' => $now,
        ':update_value' => $open ? '1' : '0',
        ':update_updated_at' => $now,
    ]);
    json_response(['open' => $open]);
}

function job_applications_to_wire($row)
{
    return [
        'id' => (int) $row['id'],
        'firstName' => $row['first_name'],
        'lastName' => $row['last_name'],
        'birthDate' => $row['birth_date'],
        'city' => $row['city'],
        'sahandPhase' => $row['sahand_phase'],
        'hasCar' => $row['has_car'],
        'maritalStatus' => $row['marital_status'],
        'childrenCount' => (int) $row['children_count'],
        'militaryStatus' => $row['military_status'],
        'militaryExemptionReason' => $row['military_exemption_reason'],
        'militaryMedicalDetail' => $row['military_medical_detail'],
        'militaryExplanation' => $row['military_explanation'],
        'militaryTempExpiry' => $row['military_temp_expiry'] ?? '',
        'education' => $row['education'],
        'educationOther' => $row['education_other'],
        'educationField' => $row['education_field'] ?? '',
        'mobile' => $row['mobile'],
        'hasWorkExperience' => (int) $row['has_work_experience'] === 1,
        'hasInsurance' => (int) $row['has_insurance'] === 1,
        'experienceNotes' => $row['experience_notes'] ?? '',
        'status' => $row['status'],
        'interviewAt' => $row['interview_at'] ?? '',
        'ip' => $row['ip'] ?? '',
        'userAgent' => $row['user_agent'] ?? '',
        'createdAt' => to_iso($row['created_at']),
        'updatedAt' => to_iso($row['updated_at']),
    ];
}

function job_applications_clean_string($body, $key)
{
    return trim((string) ($body[$key] ?? ''));
}

function job_applications_bool($body, $key)
{
    return job_applications_clean_string($body, $key) === 'yes';
}

function job_applications_validate_public($body)
{
    $errors = [];
    $required = [
        'firstName' => 'نام',
        'lastName' => 'نام خانوادگی',
        'birthDate' => 'تاریخ تولد',
        'city' => 'محل سکونت',
        'hasCar' => 'داشتن خودرو',
        'maritalStatus' => 'وضعیت تأهل',
        'childrenCount' => 'تعداد فرزندان',
        'militaryStatus' => 'وضعیت سربازی',
        'education' => 'تحصیلات',
        'mobile' => 'شماره موبایل',
    ];

    foreach ($required as $key => $label) {
        if (job_applications_clean_string($body, $key) === '') {
            $errors[$key] = "لطفاً $label را تکمیل کنید.";
        }
    }

    if (job_applications_clean_string($body, 'city') === 'سهند' && job_applications_clean_string($body, 'sahandPhase') === '') {
        $errors['sahandPhase'] = 'لطفاً فاز محل سکونت در سهند را انتخاب کنید.';
    }

    $mobile = job_applications_clean_string($body, 'mobile');
    if ($mobile !== '' && !preg_match('/^09[0-9]{9}$/', $mobile)) {
        $errors['mobile'] = 'شماره موبایل باید با قالب 09xxxxxxxxx وارد شود.';
    }

    $children = job_applications_clean_string($body, 'childrenCount');
    if ($children !== '' && (!ctype_digit($children) || (int) $children < 0)) {
        $errors['childrenCount'] = 'تعداد فرزندان باید عدد صفر یا بیشتر باشد.';
    }

    $military = job_applications_clean_string($body, 'militaryStatus');
    $reason = job_applications_clean_string($body, 'militaryExemptionReason');
    if ($military === 'معافیت دائم' && $reason === '') {
        $errors['militaryExemptionReason'] = 'لطفاً دلیل معافیت دائم را انتخاب کنید.';
    }
    if ($military === 'معافیت دائم' && $reason === 'پزشکی' && job_applications_clean_string($body, 'militaryMedicalDetail') === '') {
        $errors['militaryMedicalDetail'] = 'لطفاً علت یا وضعیت پزشکی را توضیح دهید.';
    }
    if ($military === 'معافیت دائم' && $reason === 'سایر' && job_applications_clean_string($body, 'militaryExplanation') === '') {
        $errors['militaryExplanation'] = 'لطفاً توضیح معافیت را وارد کنید.';
    }
    if ($military === 'معافیت موقت تحصیلی' && job_applications_clean_string($body, 'militaryTempExpiry') === '') {
        $errors['militaryTempExpiry'] = 'لطفاً تاریخ پایان معافیت تحصیلی را وارد کنید.';
    }

    if (job_applications_clean_string($body, 'education') === 'دیگر' && job_applications_clean_string($body, 'educationOther') === '') {
        $errors['educationOther'] = 'لطفاً عنوان مدرک تحصیلی را وارد کنید.';
    }

    if ($errors) {
        json_response(['error' => 'لطفاً خطاهای فرم را اصلاح کنید.', 'errors' => $errors], 422);
    }
}

function job_applications_public_rate_limit()
{
    $ip = substr((string) ($_SERVER['REMOTE_ADDR'] ?? ''), 0, 64);
    if ($ip === '') {
        return;
    }
    $since = gmdate('Y-m-d H:i:s', time() - 3600);
    $stmt = db()->prepare('SELECT COUNT(*) AS c FROM job_applications WHERE ip = :ip AND created_at >= :since');
    $stmt->execute([':ip' => $ip, ':since' => $since]);
    $count = (int) ($stmt->fetch()['c'] ?? 0);
    if ($count >= 5) {
        json_error('تعداد درخواست‌های ارسالی زیاد است. لطفاً کمی بعد دوباره تلاش کنید.', 429);
    }
}

function job_applications_from_wire($body)
{
    return [
        'first_name' => job_applications_clean_string($body, 'firstName'),
        'last_name' => job_applications_clean_string($body, 'lastName'),
        'birth_date' => job_applications_clean_string($body, 'birthDate'),
        'city' => job_applications_clean_string($body, 'city'),
        'sahand_phase' => job_applications_clean_string($body, 'city') === 'سهند'
            ? job_applications_clean_string($body, 'sahandPhase')
            : '',
        'has_car' => job_applications_clean_string($body, 'hasCar'),
        'marital_status' => job_applications_clean_string($body, 'maritalStatus'),
        'children_count' => (int) job_applications_clean_string($body, 'childrenCount'),
        'military_status' => job_applications_clean_string($body, 'militaryStatus'),
        'military_exemption_reason' => job_applications_clean_string($body, 'militaryExemptionReason'),
        'military_medical_detail' => job_applications_clean_string($body, 'militaryMedicalDetail'),
        'military_explanation' => job_applications_clean_string($body, 'militaryExplanation'),
        'military_temp_expiry' => job_applications_clean_string($body, 'militaryTempExpiry'),
        'education' => job_applications_clean_string($body, 'education'),
        'education_other' => job_applications_clean_string($body, 'educationOther'),
        'education_field' => job_applications_clean_string($body, 'educationField'),
        'mobile' => job_applications_clean_string($body, 'mobile'),
        'has_work_experience' => job_applications_bool($body, 'hasWorkExperience') ? 1 : 0,
        'has_insurance' => job_applications_bool($body, 'hasInsurance') ? 1 : 0,
        'experience_notes' => job_applications_clean_string($body, 'experienceNotes'),
        'ip' => substr((string) ($_SERVER['REMOTE_ADDR'] ?? ''), 0, 64),
        'user_agent' => substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255),
    ];
}

// POST /job-applications  public careers form
function job_applications_create($params, $body, $user)
{
    if (!job_applications_hiring_open()) {
        json_error('در حال حاضر پذیرش درخواست همکاری فعال نیست.', 403);
    }
    job_applications_public_rate_limit();
    job_applications_validate_public($body);

    $cols = job_applications_from_wire($body);
    $now = now_utc();
    $cols['status'] = 'new';
    $cols['created_at'] = $now;
    $cols['updated_at'] = $now;

    $fields = array_keys($cols);
    $place = array_map(fn ($f) => ':' . $f, $fields);
    $stmt = db()->prepare('INSERT INTO job_applications (' . implode(',', $fields) . ') VALUES (' . implode(',', $place) . ')');
    foreach ($cols as $k => $v) {
        $stmt->bindValue(':' . $k, $v);
    }
    $stmt->execute();
    $id = (int) db()->lastInsertId();

    json_response(['ok' => true, 'id' => $id], 201);
}

// GET /job-applications
function job_applications_list($params, $body, $user)
{
    $stmt = db()->query(JOB_APPLICATIONS_SELECT . ' ORDER BY created_at DESC, id DESC');
    json_response(['jobApplications' => array_map('job_applications_to_wire', $stmt->fetchAll())]);
}

// GET /job-applications/{id}
function job_applications_get($params, $body, $user)
{
    $stmt = db()->prepare(JOB_APPLICATIONS_SELECT . ' WHERE id = :id');
    $stmt->execute([':id' => $params['id']]);
    $row = $stmt->fetch();
    if (!$row) {
        json_error('درخواست همکاری پیدا نشد.', 404);
    }
    json_response(['jobApplication' => job_applications_to_wire($row)]);
}

// PUT /job-applications/{id}  { status, interviewAt? }
function job_applications_update($params, $body, $user)
{
    $id = $params['id'];
    $existing = db()->prepare('SELECT id FROM job_applications WHERE id = :id LIMIT 1');
    $existing->execute([':id' => $id]);
    if (!$existing->fetch()) {
        json_error('درخواست همکاری پیدا نشد.', 404);
    }

    $status = job_applications_clean_string($body, 'status');
    if (!in_array($status, JOB_APPLICATION_STATUSES, true)) {
        json_error('وضعیت درخواست نامعتبر است.', 422);
    }

    $interviewAt = job_applications_clean_string($body, 'interviewAt');
    $stmt = db()->prepare(
        'UPDATE job_applications SET status = :status, interview_at = :interview_at, updated_at = :updated_at WHERE id = :id'
    );
    $stmt->execute([
        ':status' => $status,
        ':interview_at' => $interviewAt,
        ':updated_at' => now_utc(),
        ':id' => $id,
    ]);

    $stmt = db()->prepare(JOB_APPLICATIONS_SELECT . ' WHERE id = :id');
    $stmt->execute([':id' => $id]);
    json_response(['jobApplication' => job_applications_to_wire($stmt->fetch())]);
}

// DELETE /job-applications/{id}
function job_applications_delete($params, $body, $user)
{
    $stmt = db()->prepare('DELETE FROM job_applications WHERE id = :id');
    $stmt->execute([':id' => $params['id']]);
    if ($stmt->rowCount() === 0) {
        json_error('درخواست همکاری پیدا نشد.', 404);
    }
    json_response(['ok' => true, 'id' => (int) $params['id']]);
}

// DELETE /job-applications
function job_applications_delete_all($params, $body, $user)
{
    db()->exec('DELETE FROM job_applications');
    json_response(['ok' => true]);
}
