/* ===================================================================
   سامان پولک — landing page behaviour
   =================================================================== */

/* ----------------------------------------------------------------
   CONFIG — ⚠️ replace these placeholders with the real values.
   This is the ONLY place you need to edit contact details.
   - phoneDisplay / phoneTel : landline shown + dialled
   - whatsapp : digits only, country code first, NO "+" or spaces
   - instagram / telegram : handle without "@"
   - mapUrl : Google Maps (or Neshan) link to the workshop
   ---------------------------------------------------------------- */
const CONFIG = {
  managerDisplay: '+98 914 114 4309',
  managerTel:     '+989141144309',
  techDisplay:    '+98 914 308 5877',
  techSms:        '+989143085877',
  officeDisplay:  '+98 914 847 7536',
  officeTel:      '+989148477536',
  whatsapp:       '989148477536',
  instagram:    'samanpoolak',
  telegram:     'hadibtf',
  mapUrl:       'https://www.google.com/maps/place/37%C2%B059%2739.3%22N+46%C2%B004%2744.2%22E/@37.9942399,46.0740671,17z/data=!3m1!4b1!4m7!1m2!2m1!1sSaman+Poolak+Tehran!3m3!8m2!3d37.99424!4d46.078938?entry=ttu&g_ep=EgoyMDI2MDcyOS4wIKXMDSoASAFQAw%3D%3D',
  apiUrl:       'https://api.samanpoolak.ir',
};

const TEXT = {
  "skip-to-content": {
    "fa": "رفتن به محتوا",
    "en": "Skip to content"
  },
  "saman-poolak": {
    "fa": "سامان پولک",
    "en": "Saman Poolak"
  },
  "auto-stamped-parts-since-2001": {
    "fa": "قطعات خودرو · از ۱۳۸۰",
    "en": "Auto stamped parts · since 2001"
  },
  "products": {
    "fa": "محصولات",
    "en": "Products"
  },
  "applications": {
    "fa": "کاربردها",
    "en": "Applications"
  },
  "process": {
    "fa": "فرایند تولید",
    "en": "Process"
  },
  "why-us": {
    "fa": "چرا ما",
    "en": "Why us"
  },
  "contact": {
    "fa": "تماس",
    "en": "Contact"
  },
  "get-a-quote": {
    "fa": "استعلام قیمت",
    "en": "Get a quote"
  },
  "specialist-automotive-stamping-established-200": {
    "fa": "تولیدکنندهٔ تخصصی قطعات خودرو · از سال ۱۳۸۰",
    "en": "Specialist automotive stamping · established 2001"
  },
  "we-manufacture": {
    "fa": "تولید",
    "en": "We manufacture"
  },
  "ball-joint-caps": {
    "fa": "پولک زیر سیبک",
    "en": "ball-joint caps"
  },
  "steering-caps": {
    "fa": "پولک فرمان",
    "en": "steering caps"
  },
  "and": {
    "fa": "و",
    "en": "and"
  },
  "metal-caps": {
    "fa": "درپوش فلزی",
    "en": "metal caps"
  },
  "precision-stamped-automotive-caps-and-washers": {
    "fa": "ساخت دقیق انواع پولک و درپوش فلزی برای خودرو — پولک زیر سیبک، فرمان، پولک زیر کمک‌ و درپوش‌های فلزی، با پوشش ضدزنگ .",
    "en": "Precision-stamped automotive caps and washers — ball-joint, steering and shock-absorber caps and metal covers, with white and yellow anti-corrosion plating and full quality control."
  },
  "get-a-quote-2": {
    "fa": "استعلام قیمت و سفارش",
    "en": "Get a quote"
  },
  "view-products": {
    "fa": "مشاهدهٔ محصولات",
    "en": "View products"
  },
  "anti-corrosion-plating": {
    "fa": "آبکاری ضدزنگ",
    "en": "Anti-corrosion plating"
  },
  "high-volume": {
    "fa": "تیراژ انبوه",
    "en": "High volume"
  },
  "custom-embossing": {
    "fa": "حک مارک سفارشی",
    "en": "Custom embossing"
  },
  "nationwide-shipping": {
    "fa": "ارسال سراسر کشور",
    "en": "Nationwide shipping"
  },
  "stamped-washer": {
    "fa": "واشر پرسی",
    "en": "Stamped washers"
  },
  "axle-washer-cap": {
    "fa": "پولک و درپوش محور",
    "en": "Axle caps"
  },
  "24-years": {
    "fa": "+۲۴ سال",
    "en": "24+ years"
  },
  "industrial-experience": {
    "fa": "تجربه صنعتی",
    "en": "industrial experience"
  },
  "custom-order": {
    "fa": "سفارش اختصاصی",
    "en": "made to order"
  },
  "dimensions-and-branding": {
    "fa": "ابعاد و حک برند",
    "en": "dimensions & branding"
  },
  "controlled": {
    "fa": "کنترل‌شده",
    "en": "quality controlled"
  },
  "from-press-to-delivery": {
    "fa": "از پرس تا تحویل",
    "en": "from press to delivery"
  },
  "made-in-tabriz": {
    "fa": "ساخت تبریز · ایران",
    "en": "Made in Tabriz · Iran"
  },
  "engineered-for-repeatability": {
    "fa": "مهندسی‌شده برای تولید دقیق و مداوم",
    "en": "Engineered for precise, repeatable production"
  },
  "custom-diameter": {
    "fa": "قطر و ضخامت سفارشی",
    "en": "⌀ custom diameter"
  },
  "embossed-saman-poolak-1380": {
    "fa": "حک مارک سفارشی",
    "en": "embossed: Saman Poolak 1380"
  },
  "white-and-yellow-finish": {
    "fa": "پوشش سفید و زرد",
    "en": "white & yellow finish"
  },
  "stamped-caps-and-metal-covers": {
    "fa": "پولک و درپوش فلزی",
    "en": "Stamped caps & metal covers"
  },
  "one-product-family-many-uses-steel-stamped-cap": {
    "fa": "یک خانوادهٔ محصول، برای هر کاربرد. پولک با حک برند و پوشش آبکاری دلخواه.",
    "en": "One product family, many uses. Steel stamped caps with embossed branding and two anti-corrosion plating finishes."
  },
  "two-finishes": {
    "fa": "دو نوع پوشش",
    "en": "Two finishes"
  },
  "white-zinc": {
    "fa": "پوشش سفید (زینک)",
    "en": "White zinc"
  },
  "bright-zinc-plating-corrosion-resistant": {
    "fa": "آبکاری گالوانیزه براق، مقاوم در برابر زنگ‌زدگی.",
    "en": "Bright zinc plating, corrosion resistant."
  },
  "yellow-chromate": {
    "fa": "پوشش زرد (کروماته)",
    "en": "Yellow chromate"
  },
  "durable-yellow-chromate-with-a-distinctive-loo": {
    "fa": "پوشش کروماته زرد با دوام بالا و ظاهر متمایز.",
    "en": "Durable yellow chromate with a distinctive look."
  },
  "material": {
    "fa": "جنس",
    "en": "Material"
  },
  "stamped-steel-sheet": {
    "fa": "ورق فولاد و آهن",
    "en": "Stamped steel sheet"
  },
  "diameter": {
    "fa": "قطر",
    "en": "Diameter"
  },
  "made-to-order": {
    "fa": "بر اساس سفارش",
    "en": "Made to order"
  },
  "branding": {
    "fa": "حک برند",
    "en": "Branding"
  },
  "embossed": {
    "fa": "روی محصول",
    "en": "Embossed"
  },
  "volume": {
    "fa": "تیراژ",
    "en": "Volume"
  },
  "high-volume-2": {
    "fa": "تولید انبوه",
    "en": "High volume"
  },
  "request-sample-and-price": {
    "fa": "درخواست نمونه و قیمت",
    "en": "Request sample & price"
  },
  "a-cap-for-every-position": {
    "fa": "هر پولک، برای جای خودش",
    "en": "A cap for every position"
  },
  "steering-ball-joint-cap": {
    "fa": "پولک زیر سیبک فرمان",
    "en": "Steering ball-joint cap"
  },
  "protective-cap-shielding-the-steering-ball-joi": {
    "fa": "درپوش محافظ سیبک فرمان در برابر گرد و غبار، آب و رطوبت.",
    "en": "Protective cap shielding the steering ball-joint from dust, water and moisture."
  },
  "steering-cap": {
    "fa": "پولک فرمان",
    "en": "Steering cap"
  },
  "steering-assembly-cap-with-standard-dimensions": {
    "fa": "پولک و درپوش مجموعهٔ فرمان با ابعاد استاندارد و تلورانس دقیق.",
    "en": "Steering-assembly cap with standard dimensions and tight tolerance."
  },
  "shock-absorber-cap": {
    "fa": "پولک زیر کمک‌فنر",
    "en": "Shock-absorber cap"
  },
  "high-strength-protective-cap-for-under-the-sho": {
    "fa": "پولک محافظ زیر کمک‌فنر با استحکام بالا و پوشش ضدزنگ.",
    "en": "High-strength protective cap for under the shock absorber, anti-corrosion plated."
  },
  "metal-cap-cover": {
    "fa": "درپوش فلزی",
    "en": "Metal cap / cover"
  },
  "all-kinds-of-stamped-metal-caps-and-washers-in": {
    "fa": "انواع درپوش فلزی در اندازه‌ها و طرح‌های سفارشی.",
    "en": "All kinds of stamped metal caps and washers in custom sizes and designs."
  },
  "our-impact-press": {
    "fa": "پرس ضربه‌ای کارگاه ما",
    "en": "Our impact press"
  },
  "from-steel-sheet-to-finished-part": {
    "fa": "از ورق فولادی تا قطعهٔ آماده",
    "en": "From steel sheet to finished part"
  },
  "blanking-and-punching": {
    "fa": "برش و پانچ ورق",
    "en": "Blanking & punching"
  },
  "preparing-steel-sheet-to-exact-size": {
    "fa": "آماده‌سازی ورق فولادی در ابعاد دقیق.",
    "en": "Preparing steel sheet to exact size."
  },
  "impact-press-and-draw": {
    "fa": "پرس ضربه‌ای و کشش",
    "en": "Impact press & draw"
  },
  "forming-the-cap-on-the-impact-press": {
    "fa": "فرم‌دهی پولک با پرس ضربه‌ای.",
    "en": "Forming the cap on the impact press."
  },
  "forming-and-embossing": {
    "fa": "پولک‌زنی و حک برند",
    "en": "Forming & embossing"
  },
  "final-shaping-and-brand-embossing": {
    "fa": "ایجاد فرم نهایی و حک نام برند.",
    "en": "Final shaping and brand embossing."
  },
  "white-zinc-or-yellow-chromate-finish": {
    "fa": "پوشش سفید (زینک) یا زرد (کروماته).",
    "en": "White zinc or yellow chromate finish."
  },
  "qc-and-packaging": {
    "fa": "کنترل کیفیت و بسته‌بندی",
    "en": "QC & packaging"
  },
  "dimensional-inspection-and-packing-for-shipmen": {
    "fa": "بازرسی ابعادی و بسته‌بندی برای ارسال.",
    "en": "Dimensional inspection and packing for shipment."
  },
  "established-1380": {
    "fa": "سال تأسیس",
    "en": "Established (1380)"
  },
  "years-of-experience": {
    "fa": "سال تجربه",
    "en": "Years of experience"
  },
  "parts-produced": {
    "fa": "قطعهٔ تولیدشده",
    "en": "Parts produced"
  },
  "quality-controlled": {
    "fa": "کنترل کیفیت",
    "en": "Quality controlled"
  },
  "why-us-2": {
    "fa": "چرا سامان پولک",
    "en": "Why us"
  },
  "stamping-quality-at-industrial-scale": {
    "fa": "کیفیت، در مقیاس صنعتی",
    "en": "Stamping quality, at industrial scale"
  },
  "quality-and-durability": {
    "fa": "کیفیت و دوام",
    "en": "Quality & durability"
  },
  "premium-raw-material-and-anti-corrosion-platin": {
    "fa": "مواد اولیهٔ مرغوب و پوشش ضدزنگ برای عمر طولانی قطعه.",
    "en": "Premium raw material and anti-corrosion plating for a long part life."
  },
  "dimensional-accuracy": {
    "fa": "دقت ابعادی",
    "en": "Dimensional accuracy"
  },
  "precise-tooling-and-high-repeatability-in-mass": {
    "fa": "قالب‌های دقیق و تکرارپذیری بالا در تولید انبوه.",
    "en": "Precise tooling and high repeatability in mass production."
  },
  "finish-options": {
    "fa": "تنوع پوشش",
    "en": "Finish options"
  },
  "white-and-yellow-plating-resistant-to-rust-and": {
    "fa": "آبکاری سفید و زرد، مقاوم در برابر زنگ و خوردگی.",
    "en": "White and yellow plating, resistant to rust and corrosion."
  },
  "volume-and-delivery": {
    "fa": "تیراژ و تحویل",
    "en": "Volume & delivery"
  },
  "high-volume-capacity-and-on-time-nationwide-de": {
    "fa": "ظرفیت تولید انبوه و تحویل به‌موقع به سراسر کشور.",
    "en": "High-volume capacity and on-time nationwide delivery."
  },
  "custom-manufacturing": {
    "fa": "تولید سفارشی",
    "en": "Custom manufacturing"
  },
  "caps-and-covers-made-to-your-diameter-depth-an": {
    "fa": "ساخت پولک و درپوش در قطر، عمق و طرح دلخواه شما.",
    "en": "Caps and covers made to your diameter, depth and design."
  },
  "your-branding": {
    "fa": "حک برند شما",
    "en": "Your branding"
  },
  "we-can-emboss-your-name-and-logo-on-the-part": {
    "fa": "امکان حک نام و لوگوی برند شما روی قطعه.",
    "en": "We can emboss your name and logo on the part."
  },
  "request-a-price-and-order": {
    "fa": "درخواست قیمت و سفارش",
    "en": "Request a price & order"
  },
  "fill-in-your-order-details-your-request-opens": {
    "fa": "مشخصات سفارش‌تان را وارد کنید؛ درخواست در واتساپ برای ما باز می‌شود و در سریع‌ترین زمان پاسخ می‌دهیم.",
    "en": "Fill in your order details — your request opens in WhatsApp and we reply as fast as possible."
  },
  "fast-reply-from-sales": {
    "fa": "پاسخ سریع کارشناس فروش",
    "en": "Fast reply from sales"
  },
  "volume-based-pricing": {
    "fa": "قیمت‌گذاری بر اساس تیراژ",
    "en": "Volume-based pricing"
  },
  "samples-available": {
    "fa": "امکان ارسال نمونه",
    "en": "Samples available"
  },
  "name-company": {
    "fa": "نام / نام شرکت",
    "en": "Name / company"
  },
  "phone": {
    "fa": "شمارهٔ تماس",
    "en": "Phone"
  },
  "product": {
    "fa": "نوع محصول",
    "en": "Product"
  },
  "other-custom": {
    "fa": "سایر / سفارشی",
    "en": "Other / custom"
  },
  "quantity": {
    "fa": "تعداد / تیراژ",
    "en": "Quantity"
  },
  "notes-diameter-finish": {
    "fa": "توضیحات (قطر، پوشش، …)",
    "en": "Notes (diameter, finish, …)"
  },
  "send-request-on-whatsapp": {
    "fa": "ارسال درخواست در واتساپ",
    "en": "Send request on WhatsApp"
  },
  "on-submit-a-whatsapp-chat-opens-pre-filled-wit": {
    "fa": "با ارسال، گفتگوی واتساپ با اطلاعات سفارش شما باز می‌شود.",
    "en": "On submit, a WhatsApp chat opens pre-filled with your order."
  },
  "contact-2": {
    "fa": "تماس با ما",
    "en": "Contact"
  },
  "get-in-touch-to-order": {
    "fa": "برای سفارش در ارتباط باشید",
    "en": "Get in touch to order"
  },
  "phone-2": {
    "fa": "تلفن",
    "en": "Phone"
  },
  "whatsapp": {
    "fa": "واتساپ",
    "en": "WhatsApp"
  },
  "instagram": {
    "fa": "اینستاگرام",
    "en": "Instagram"
  },
  "telegram": {
    "fa": "تلگرام",
    "en": "Telegram"
  },
  "workshop-address": {
    "fa": "آدرس کارگاه",
    "en": "Workshop address"
  },
  "tehran-iran-add-your-full-address-here": {
    "fa": "تهران، — نشانی دقیق را اینجا وارد کنید —",
    "en": "Tehran, Iran — add your full address here —"
  },
  "view-on-map": {
    "fa": "مشاهده روی نقشه",
    "en": "View on map"
  },
  "manufacturer-of-ball-joint-steering-and-shock": {
    "fa": "تولیدکنندهٔ پولک زیر سیبک، پولک فرمان، پولک زیر کمک‌فنر و درپوش فلزی خودرو.",
    "en": "Manufacturer of ball-joint, steering and shock-absorber caps and stamped metal covers for vehicles."
  },
  "ball-joint-cap-steering-cap-shock-absorber-cap": {
    "fa": "پولک زیر سیبک · پولک زیر سیبک فرمان · پولک فرمان · پولک زیر کمک‌فنر · درپوش فلزی · پولک درپوش فلزی · واشر",
    "en": "ball-joint cap · steering cap · shock-absorber cap · metal cap · stamped washer"
  },
  "2026-saman-poolak-all-rights-reserved": {
    "fa": "© ۱۴۰۵ سامان پولک. تمامی حقوق محفوظ است.",
    "en": "© 2026 Saman Poolak. All rights reserved."
  },
  "e-g-acme-co": {
    "fa": "شرکت ...",
    "en": "e.g. Acme Co."
  },
  "09xx-xxx-xxxx": {
    "fa": "۰۹۱۲۳۴۵۶۷۸۹",
    "en": "09xx xxx xxxx"
  },
  "e-g-10-000-pcs": {
    "fa": "۱۰٬۰۰۰ عدد",
    "en": "e.g. 10,000 pcs"
  },
  "required-diameter-finish-white-yellow-and-any": {
    "fa": "قطر مورد نیاز، نوع پوشش (سفید/زرد)، و هر توضیح دیگر.",
    "en": "Required diameter, finish (white/yellow), and any other details."
  },
  "all-kinds-of-stamped-metal-caps-and-washers-in-2": {
    "fa": "انواع درپوش و واشر فلزی در اندازه‌ها و طرح‌های سفارشی.",
    "en": "All kinds of stamped metal caps and washers in custom sizes and designs."
  },
 
};

Object.assign(TEXT, {
  'manager': {
    fa: 'مدیر',
    en: 'Manager',
  },
  'technical-manager-sms': {
    fa: 'مدیر فنی فقط پیامک',
    en: 'Technical manager SMS only',
  },
  'office-whatsapp': {
    fa: 'اداری، حسابداری و واتساپ',
    en: 'Office, accounting & WhatsApp',
  },
  'product': {
    fa: 'نوع محصول یا قطعه',
    en: 'Product or part type',
  },
  'product-free-text-placeholder': {
    fa: 'پولک زیر سیبک، درپوش فلزی، یا قطعه مشابه',
    en: 'e.g. ball-joint cap, metal cover, or similar part',
  },
  'send-method': {
    fa: 'روش ارسال درخواست',
    en: 'Send method',
  },
  'send-direct': {
    fa: 'ثبت مستقیم در پلتفرم سامان پولک',
    en: 'Submit directly to Saman Poolak platform',
  },
  'send-whatsapp': {
    fa: 'ارسال در واتساپ',
    en: 'Send via WhatsApp',
  },
  'send-telegram': {
    fa: 'ارسال در تلگرام',
    en: 'Send via Telegram',
  },
  'send-request': {
    fa: 'ارسال درخواست',
    en: 'Send request',
  },
  'request-send-hint': {
    fa: 'در حالت ثبت مستقیم، درخواست داخل پلتفرم سامان پولک ذخیره می‌شود. برای واتساپ و تلگرام، پیام آماده می‌شود.',
    en: 'Direct submissions are saved in the Saman Poolak platform. WhatsApp and Telegram prepare a message for you.',
  },
  'tehran-iran-add-your-full-address-here': {
    fa: 'جاده تبریز - آذرشهر، نرسیده به پلیس راه، جنب نیروگاه حرارتی تبریز، کوی ماندگار، شهرک صنعتی غرب تبریز، پلاک ۷۰',
    en: 'Tabriz-Azarshahr road, before the police road station, next to Tabriz thermal power plant, Mandegar alley, West Tabriz Industrial Town, No. 70',
  },
  'manufacturer-of-ball-joint-steering-and-shock': {
    fa: 'تولیدکنندهٔ پولک زیر سیبک، پولک فرمان، پولک زیر کمک‌فنر، درپوش فلزی و انواع قطعات مشابه.',
    en: 'Manufacturer of ball-joint caps, steering caps, shock-absorber caps, metal covers and similar stamped parts.',
  },
});

const META = {
  title: {
    fa: 'سامان پولک | تولید پولک زیر سیبک، پولک فرمان و درپوش فلزی',
    en: 'Saman Poolak | Ball-joint, steering & metal caps manufacturer',
  },
  desc: {
    fa: 'سامان پولک، تولیدکنندهٔ تخصصی پولک زیر سیبک، پولک فرمان، پولک زیر کمک‌فنر، درپوش فلزی و انواع قطعات مشابه از سال ۱۳۸۰.',
    en: 'Saman Poolak — specialist manufacturer of ball-joint caps, steering caps, shock-absorber caps, metal covers and similar stamped parts, since 2001.',
  },
};

/* ---------- wire up contact links ---------- */
(function wireContacts() {
  const set = (id, attr, val, text) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (attr) el.setAttribute('href', val);
    if (text) el.textContent = text;
  };
  set('cManager', 'href', 'tel:' + CONFIG.managerTel);
  const mv = document.getElementById('cManagerVal'); if (mv) mv.textContent = CONFIG.managerDisplay;
  set('cTech', 'href', 'sms:' + CONFIG.techSms);
  const tv = document.getElementById('cTechVal'); if (tv) tv.textContent = CONFIG.techDisplay;
  set('cWa', 'href', 'https://wa.me/' + CONFIG.whatsapp);
  const wv = document.getElementById('cWaVal'); if (wv) wv.textContent = CONFIG.officeDisplay;
  set('cIg', 'href', 'https://instagram.com/' + CONFIG.instagram);
  set('cTg', 'href', 'https://t.me/' + CONFIG.telegram);
  const tg = document.getElementById('cTgVal'); if (tg) tg.textContent = '@' + CONFIG.telegram;
  set('cMap', 'href', CONFIG.mapUrl);
})();

/* ---------- language toggle ---------- */
const faDigits = (s) => String(s).replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
const langBtn = document.getElementById('langToggle');

function localizeNum(n, suffix = '') {
  const fa = document.documentElement.lang === 'fa';
  let suf = suffix;
  if (fa) suf = suf.replace('%', '٪');
  return (fa ? faDigits(n) : String(n)) + (fa ? faDigits(suf) : suf);
}

function setMeta(name, content) {
  let m = document.querySelector(`meta[name="${name}"]`);
  if (m) m.setAttribute('content', content);
}

function applyLang(lang) {
  const fa = lang === 'fa';
  const root = document.documentElement;
  root.lang = lang;
  root.dir = fa ? 'rtl' : 'ltr';

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const item = TEXT[el.getAttribute('data-i18n')];
    if (item?.[lang] != null) el.textContent = item[lang];
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const item = TEXT[el.getAttribute('data-i18n-placeholder')];
    if (item?.[lang] != null) el.placeholder = item[lang];
  });

  document.title = META.title[lang];
  setMeta('description', META.desc[lang]);

  langBtn.textContent = fa ? 'EN' : 'فا';
  langBtn.setAttribute('aria-label', fa ? 'Switch to English' : 'تغییر به فارسی');

  // re-localize already-animated counters
  document.querySelectorAll('.num[data-done]').forEach((el) => {
    el.textContent = localizeNum(el.dataset.count, el.dataset.suffix || '');
  });

  try { localStorage.setItem('sp-lang', lang); } catch (e) {}
}

const savedLang = (() => { try { return localStorage.getItem('sp-lang'); } catch (e) { return null; } })();
applyLang(savedLang === 'en' ? 'en' : 'fa');
langBtn.addEventListener('click', () => applyLang(document.documentElement.lang === 'fa' ? 'en' : 'fa'));

/* ---------- header scrolled state ---------- */
const header = document.querySelector('.site-header');
const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 10);
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });

/* ---------- mobile nav ---------- */
const navToggle = document.getElementById('navToggle');
const mainNav = document.querySelector('.main-nav');
navToggle.addEventListener('click', () => {
  const open = mainNav.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
});
mainNav.addEventListener('click', (e) => {
  if (e.target.tagName === 'A') {
    mainNav.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
  }
});

/* ---------- reveal on scroll + counters ---------- */
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function animateCount(el) {
  if (el.dataset.done) return;
  const target = +el.dataset.count;
  const suffix = el.dataset.suffix || '';
  if (reduce || !target) { el.dataset.done = '1'; el.textContent = localizeNum(target, suffix); return; }
  const dur = 1400;
  let start = null;
  function frame(t) {
    if (!start) start = t;
    const p = Math.min((t - start) / dur, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = localizeNum(Math.round(target * eased), suffix);
    if (p < 1) requestAnimationFrame(frame);
    else el.dataset.done = '1';
  }
  requestAnimationFrame(frame);
}

if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('in');
      entry.target.querySelectorAll?.('.num').forEach(animateCount);
      if (entry.target.classList.contains('num')) animateCount(entry.target);
      io.unobserve(entry.target);
    });
  }, { threshold: 0.18, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
} else {
  document.querySelectorAll('.reveal').forEach((el) => el.classList.add('in'));
  document.querySelectorAll('.num').forEach((el) => { el.textContent = localizeNum(el.dataset.count, el.dataset.suffix || ''); el.dataset.done = '1'; });
}

/* ---------- quote form ---------- */
const form = document.getElementById('quoteForm');
form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fa = document.documentElement.lang === 'fa';
  const name = form.name.value.trim();
  const phone = form.phone.value.trim();
  const product = form.product.value.trim();
  const qty = form.qty.value.trim();
  const note = form.note.value.trim();
  const channel = form.channel.value || 'direct';
  const submitBtn = form.querySelector('button[type="submit"]');
  const hint = document.getElementById('quoteHint');

  if (!name || !phone || !product) {
    const missing = !name ? form.querySelector('#qName') : (!phone ? form.querySelector('#qPhone') : form.querySelector('#qProduct'));
    missing.focus();
    missing.style.borderColor = '#ff5d5d';
    setTimeout(() => (missing.style.borderColor = ''), 1800);
    return;
  }

  const L = fa
    ? { h: 'درخواست قیمت — سامان پولک', name: 'نام', phone: 'تماس', product: 'محصول', qty: 'تعداد', note: 'توضیحات' }
    : { h: 'Quote request — Saman Poolak', name: 'Name', phone: 'Phone', product: 'Product', qty: 'Quantity', note: 'Notes' };

  let msg = `*${L.h}*\n`;
  msg += `${L.name}: ${name}\n`;
  msg += `${L.phone}: ${phone}\n`;
  msg += `${L.product}: ${product}\n`;
  if (qty) msg += `${L.qty}: ${qty}\n`;
  if (note) msg += `${L.note}: ${note}\n`;

  if (channel === 'whatsapp') {
    window.open(`https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
    return;
  }

  if (channel === 'telegram') {
    try { await navigator.clipboard?.writeText(msg); } catch (err) {}
    window.open(`https://t.me/${CONFIG.telegram}`, '_blank', 'noopener');
    if (hint) hint.textContent = fa
      ? 'متن درخواست کپی شد؛ آن را در تلگرام ارسال کنید.'
      : 'The request text was copied; paste it in Telegram.';
    return;
  }

  submitBtn.disabled = true;
  try {
    const res = await fetch(`${CONFIG.apiUrl}/inquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ name, phone, product, quantity: qty, note, source: 'direct' }),
    });
    if (!res.ok) throw new Error('Request failed');
    form.reset();
    if (hint) hint.textContent = fa
      ? 'درخواست شما ثبت شد؛ به‌زودی با شما تماس می‌گیریم.'
      : 'Your request was saved. We will contact you soon.';
  } catch (err) {
    if (hint) hint.textContent = fa
      ? 'ثبت مستقیم انجام نشد؛ لطفاً واتساپ یا تلگرام را انتخاب کنید.'
      : 'Direct submission failed. Please use WhatsApp or Telegram.';
  } finally {
    submitBtn.disabled = false;
  }
});
