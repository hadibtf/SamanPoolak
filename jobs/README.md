# Careers Site - jobs.samanpoolak.ir

Static Persian/RTL careers website for Saman Poolak.

- Homepage: `https://jobs.samanpoolak.ir`
- Application form: `https://jobs.samanpoolak.ir/apply`
- Public submit API: `POST https://api.samanpoolak.ir/job-applications`
- Internal management page: `https://platform.samanpoolak.ir/job-applications`

## Deploy

Deploy the careers site with:

```bash
npm run deploy:jobs
```

If FTP upload is unreliable, choose `manual` mode. The script creates `jobs.zip`
and tells you to upload/unzip it in:

```text
/home/hadibt/jobs
```

## API Setup

The careers form submits to the live API. The live `api/config.php` CORS allowlist
must include:

```php
'https://jobs.samanpoolak.ir',
```

Deploy the API after adding the job application routes:

```bash
npm run deploy:api
```

## Database Setup

Create the `job_applications` and `app_settings` tables once in phpMyAdmin.

1. Open cPanel.
2. Open phpMyAdmin.
3. Select database: `hadibt_business_platform`.
4. Open the SQL tab.
5. Run the `CREATE TABLE IF NOT EXISTS app_settings` statement from
   `server/schema.sql`.
6. Run the `CREATE TABLE IF NOT EXISTS job_applications` statement from
   `server/schema.sql`.

After the tables exist, submitted applications will be saved by the API and shown
inside the platform page at `/job-applications`. The hiring open/closed switch is
also controlled from that platform page.

## Final Check

After deploying API, platform, and jobs site:

1. Open `https://jobs.samanpoolak.ir/apply`.
2. Submit one test application.
3. Open `https://platform.samanpoolak.ir/job-applications`.
4. Confirm the test application appears.
