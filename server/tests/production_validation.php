<?php
require_once __DIR__ . '/../routes/production.php';

function check($condition, $message)
{
    if (!$condition) throw new RuntimeException($message);
}

$leapYears = [1408,1412,1416,1420,1424,1428,1432,1436,1441,1445,1449,1453,1457,1461,1465,1469,1473,1478,1482,1486,1490,1494,1498];
for ($year = 1405; $year <= 1499; $year++) {
    for ($month = 1; $month <= 12; $month++) {
        $length = $month <= 6 ? 31 : ($month <= 11 ? 30 : (in_array($year, $leapYears, true) ? 30 : 29));
        for ($day = 1; $day <= 31; $day++) {
            $date = sprintf('%04d%02d%02d', $year, $month, $day);
            check(production_valid_date($date) === ($day <= $length), "Wrong validity: $date");
        }
    }
}
foreach (['14040701', '15000101', '14050000', '14051301', '14050132', '1405junk'] as $date) {
    check(!production_valid_date($date), "Accepted invalid date: $date");
}
foreach (['1', '0.001', '123.456', '99999999999.999', '۱۲.۳۴۵'] as $quantity) {
    check(production_valid_quantity($quantity), "Rejected valid quantity: $quantity");
}
foreach (['0', '-1', '1.0001', '1e3', 'foo', '100000000000', '0.000'] as $quantity) {
    check(!production_valid_quantity($quantity), "Accepted invalid quantity: $quantity");
}
check(production_log_weight_grams(10, 300) === 300.0, '10 pieces must weigh the measured amount');
check(production_log_weight_grams(500, 300) === 15000.0, '500 pieces at 0.3 kg per 10 must weigh 15 kg');
echo "Production validation passed\n";
