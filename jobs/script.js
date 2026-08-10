const API_URL = 'https://api.samanpoolak.ir';

const form = document.getElementById('applicationForm');
const errorsBox = document.getElementById('formErrors');
const successMessage = document.getElementById('successMessage');
const submitBtn = document.getElementById('submitBtn');
const closedNotice = document.getElementById('closedNotice');
let hiringOpen = true;

const qs = (name) => form?.elements?.[name];
const normalizeDigits = (value) => String(value)
  .replace(/[۰-۹]/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))
  .replace(/[٠-٩]/g, (digit) => '٠١٢٣٤٥٦٧٨٩'.indexOf(digit));
const valueOf = (name) => {
  const field = qs(name);
  if (!field) return '';
  if (field instanceof RadioNodeList) return field.value || '';
  return field.value || '';
};
const showIf = (key, show) => {
  document.querySelectorAll(`[data-conditional="${key}"]`).forEach((el) => {
    el.classList.toggle('show', show);
  });
};

function updateConditionalFields() {
  const city = valueOf('city');
  const military = valueOf('militaryStatus');
  const reason = valueOf('militaryExemptionReason');
  const education = valueOf('education');

  showIf('sahand', city === 'سهند');
  showIf('exemption', military === 'معافیت دائم');
  showIf('medical', military === 'معافیت دائم' && reason === 'پزشکی');
  showIf('other-exemption', military === 'معافیت دائم' && reason === 'سایر');
  showIf('temp-exemption', military === 'معافیت موقت تحصیلی');
  showIf('education-other', education === 'دیگر');
  if (valueOf('maritalStatus') === 'مجرد') {
    qs('childrenCount').value = '0';
  }
}

function payloadFromForm() {
  const birthDate = [valueOf('birthYear'), valueOf('birthMonth'), valueOf('birthDay')]
    .filter(Boolean)
    .join('/');

  return {
    firstName: qs('firstName').value.trim(),
    lastName: qs('lastName').value.trim(),
    birthDate,
    birthDay: valueOf('birthDay'),
    birthMonth: valueOf('birthMonth'),
    birthYear: valueOf('birthYear'),
    city: valueOf('city'),
    sahandPhase: valueOf('sahandPhase'),
    hasCar: valueOf('hasCar'),
    maritalStatus: valueOf('maritalStatus'),
    childrenCount: qs('childrenCount').value.trim(),
    militaryStatus: valueOf('militaryStatus'),
    militaryExemptionReason: valueOf('militaryExemptionReason'),
    militaryMedicalDetail: qs('militaryMedicalDetail').value.trim(),
    militaryExplanation: qs('militaryExplanation').value.trim(),
    militaryTempExpiry: qs('militaryTempExpiry').value.trim(),
    hasWorkExperience: valueOf('hasWorkExperience'),
    hasInsurance: valueOf('hasInsurance'),
    experienceNotes: qs('experienceNotes').value.trim(),
    education: valueOf('education'),
    educationOther: qs('educationOther').value.trim(),
    educationField: qs('educationField').value.trim(),
    mobile: normalizeDigits(qs('mobile').value.trim()),
  };
}

function validate(data) {
  const errors = [];
  const required = [
    ['firstName', 'نام'],
    ['lastName', 'نام خانوادگی'],
    ['birthDate', 'تاریخ تولد'],
    ['city', 'محل سکونت'],
    ['hasCar', 'داشتن خودرو'],
    ['maritalStatus', 'وضعیت تأهل'],
    ['childrenCount', 'تعداد فرزندان'],
    ['militaryStatus', 'وضعیت سربازی'],
    ['education', 'تحصیلات'],
    ['mobile', 'شماره موبایل'],
  ];

  required.forEach(([key, label]) => {
    if (!data[key]) errors.push(`لطفاً ${label} را تکمیل کنید.`);
  });
  if (!data.birthDay) errors.push('لطفاً روز تولد را انتخاب کنید.');
  if (!data.birthMonth) errors.push('لطفاً ماه تولد را انتخاب کنید.');
  if (!data.birthYear) errors.push('لطفاً سال تولد را انتخاب کنید.');
  if (data.city === 'سهند' && !data.sahandPhase) errors.push('لطفاً فاز محل سکونت در سهند را انتخاب کنید.');
  if (data.mobile && !/^09\d{9}$/.test(data.mobile)) errors.push('شماره موبایل باید با قالب 09xxxxxxxxx وارد شود.');
  if (data.childrenCount && Number(data.childrenCount) < 0) errors.push('تعداد فرزندان باید صفر یا بیشتر باشد.');
  if (data.militaryStatus === 'معافیت دائم' && !data.militaryExemptionReason) errors.push('لطفاً دلیل معافیت دائم را انتخاب کنید.');
  if (data.militaryExemptionReason === 'پزشکی' && !data.militaryMedicalDetail) errors.push('لطفاً علت یا وضعیت پزشکی را توضیح دهید.');
  if (data.militaryExemptionReason === 'سایر' && !data.militaryExplanation) errors.push('لطفاً توضیح معافیت را وارد کنید.');
  if (data.militaryStatus === 'معافیت موقت تحصیلی' && !data.militaryTempExpiry) errors.push('لطفاً تاریخ پایان معافیت تحصیلی را وارد کنید.');
  if (data.education === 'دیگر' && !data.educationOther) errors.push('لطفاً عنوان مدرک تحصیلی را وارد کنید.');

  return errors;
}

function showErrors(errors) {
  if (!errors.length) {
    errorsBox.hidden = true;
    errorsBox.innerHTML = '';
    return;
  }
  errorsBox.innerHTML = errors.map((error) => `<div>${error}</div>`).join('');
  errorsBox.hidden = false;
  errorsBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function loadHiringStatus() {
  if (!form || !closedNotice) return;
  try {
    const res = await fetch(`${API_URL}/job-applications/status`, {
      headers: { Accept: 'application/json' },
    });
    const data = await res.json();
    hiringOpen = data.open !== false;
  } catch (error) {
    hiringOpen = true;
  }
  form.hidden = !hiringOpen;
  closedNotice.hidden = hiringOpen;
}

form?.addEventListener('input', updateConditionalFields);
form?.addEventListener('change', updateConditionalFields);
form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!hiringOpen) {
    showErrors(['در حال حاضر پذیرش درخواست همکاری فعال نیست.']);
    return;
  }
  const data = payloadFromForm();
  const errors = validate(data);
  showErrors(errors);
  if (errors.length) return;

  submitBtn.disabled = true;
  submitBtn.textContent = 'در حال ثبت...';
  try {
    const res = await fetch(`${API_URL}/job-applications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      const serverErrors = result.errors ? Object.values(result.errors) : [result.error || 'ثبت درخواست ناموفق بود.'];
      if (res.status === 403) {
        hiringOpen = false;
        form.hidden = true;
        closedNotice.hidden = false;
      }
      showErrors(serverErrors);
      return;
    }
    form.reset();
    updateConditionalFields();
    showErrors([]);
    successMessage.hidden = false;
    successMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (error) {
    showErrors(['ارتباط با سامانه برقرار نشد. لطفاً اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.']);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'ثبت درخواست همکاری';
  }
});

updateConditionalFields();

function fillBirthSelects() {
  const day = qs('birthDay');
  const month = qs('birthMonth');
  const year = qs('birthYear');
  if (!day || !month || !year || day.options.length > 1) return;

  for (let value = 1; value <= 31; value += 1) {
    day.add(new Option(String(value).padStart(2, '0'), String(value).padStart(2, '0')));
  }
  const months = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
  months.forEach((label, index) => {
    month.add(new Option(label, String(index + 1).padStart(2, '0')));
  });
  for (let value = 1390; value >= 1330; value -= 1) {
    year.add(new Option(String(value), String(value)));
  }
}

fillBirthSelects();
loadHiringStatus();
