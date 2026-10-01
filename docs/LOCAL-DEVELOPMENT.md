# Local development

This guide sets up a fresh computer to run Saman Poolak against a private local
MySQL database and PHP API. The local stack is isolated from production and
does not import production data.

## Requirements

- Git
- Node.js 20.19+ or 22.12+ with npm (required by Vite 8)
- Docker Desktop with Docker Compose v2, running Linux containers
- Windows, macOS, or Linux

The frontend build has been verified with Node.js 24.16 and npm 11.17. On
Windows, Docker Desktop's WSL 2 backend is recommended.

## First-time setup

1. Clone the repository and enter it:

   ```sh
   git clone https://github.com/hadibtf/SamanPoolak.git
   cd SamanPoolak
   ```

2. Install JavaScript dependencies:

   ```sh
   npm install
   ```

3. Start Docker Desktop and wait until its engine is running. Confirm Compose
   is available:

   ```sh
   docker compose version
   ```

4. Create the local-only PHP configuration if it does not exist:

   ```sh
   cp server/config.local.sample.php server/config.local.php
   ```

   In PowerShell, use:

   ```powershell
   Copy-Item server/config.local.sample.php server/config.local.php
   ```

   The sample credentials are disposable local defaults. Keep
   `config.local.php` private; it is gitignored. If you change the database
   name, user, or password here, make the same change to the `database`
   service environment in `docker-compose.yml`. Keep the database host set to
   `database`, which is the Compose service name visible from the API container.
   The local CORS allowlist supports both `localhost` and `127.0.0.1` for the
   management and employee frontends.
   Change `setup_key` to a private local value before creating an admin account.

5. Start the local API and database from the repository root:

   ```sh
   npm run local:up
   ```

   The first start builds the PHP image and initializes a new database from
   `server/schema.sql`. Wait for the database health check, then confirm the API
   responds:

   ```sh
   curl http://localhost:18000/
   ```

   The response should be JSON containing `"ok": true`.

6. Create an admin user in the empty local database. Set the username, password,
   display name, and setup key to your own local values. Example for PowerShell:

   ```powershell
   $body = @{
     setupKey = 'your-local-setup-key'
     username = 'admin'
     password = 'choose-a-local-password'
     displayName = 'Local Admin'
   } | ConvertTo-Json
   Invoke-RestMethod -Method Post -Uri http://localhost:18000/setup/seed-admin `
     -ContentType 'application/json' -Body $body
   ```

   For macOS/Linux, send the same JSON to `POST
   http://localhost:18000/setup/seed-admin` with `curl`:

   ```sh
   curl -X POST http://localhost:18000/setup/seed-admin \
     -H 'Content-Type: application/json' \
     -d '{"setupKey":"your-local-setup-key","username":"admin","password":"choose-a-local-password","displayName":"Local Admin"}'
   ```

   The setup endpoint checks the configured setup key and creates the requested
   admin username if that username does not already exist. Keep the API bound to
   localhost as configured; do not expose this local setup endpoint to a network.

7. In a second terminal, start the management frontend:

   ```sh
   npm run dev:platform
   ```

   Open <http://localhost:3000> and sign in with the local admin account. Create
   local employees and employee accounts through the management app as needed.

8. To run the employee frontend too, open a third terminal and run:

   ```sh
   npm run dev:employee
   ```

   Open <http://localhost:3001>.

Vite binds to all interfaces during local development and prints both the
`localhost` URL and a `Network` URL discovered from the machine's LAN address.
During development, API requests go through Vite's same-origin `/__api` proxy
to `127.0.0.1:18000`. This lets another device use the LAN URL without exposing
the API port or configuring browser CORS. The proxy sends the local app origin
expected by the API's login surface check. Set `VITE_API_URL` explicitly only
when you want the browser to call a different API directly.

## Services and local files

| Service | Address / location | Purpose |
| --- | --- | --- |
| Management React app | `http://localhost:3000` | Admin and management interface |
| Employee React app | `http://localhost:3001` | Employee interface |
| PHP API | `http://localhost:18000` | Local API used by both apps |
| MySQL | Docker network only | Local application database |
| Database volume | `samanpoolak-local-db` | Persists local records between runs |
| PHP config | `server/config.local.php` | Local DB credentials, origins, setup key |

`npm run dev:platform` and `npm run dev:employee` set the correct React surface,
port, and local API URL. Production deploy scripts continue to use the hosted API
configuration. `docker-compose.yml` binds the API port to `127.0.0.1`; MySQL has
no host port published.

## Daily commands

Run these from the repository root:

| Command | Effect |
| --- | --- |
| `npm run local:up` | Start or rebuild the local API and database |
| `npm run local:status` | Show Compose container status |
| `docker compose logs -f api` | Follow API logs |
| `docker compose logs -f database` | Follow MySQL logs |
| `npm run local:down` | Stop containers and keep the database volume |
| `npm run local:reset` | Stop containers and permanently erase the local database volume |
| `npm run build` | Create the frontend production build |

After `local:down`, run `local:up` to resume with the same local users and data.
After `local:reset`, run `local:up` and create the local admin again. Reset only
removes the Compose volume named `samanpoolak-local-db`; it does not target a
hosted database. Never copy production records into this environment unless they
have been deliberately sanitized.

## Troubleshooting

- **`docker` is not recognized or the daemon is unavailable:** install/start
  Docker Desktop, wait for its engine, then reopen the terminal and check
  `docker compose version`.
- **Port 8000, 3000, or 3001 is already in use:** stop the other local service
  using that port before starting this one. The API port is intentionally fixed
  at 8000 in Compose; frontend launchers accept `PORT` if a different frontend
  port is required, but the configured CORS origins must then be updated in
  `server/config.local.php` too.
- **The API cannot connect to MySQL:** check `docker compose ps` and
  `docker compose logs database api`. In the API container, the DB host must be
  `database`, not `localhost`; local PHP credentials must match the Compose
  database environment. If you changed MySQL credentials after the volume had
  already been initialized, reset the local volume and start again.
- **Frontend login or requests fail:** confirm the API health URL works, start
  the frontend with the matching `dev:*` command, and confirm the two frontend
  origins are in `cors_allowed_origins` in `server/config.local.php`.
- **A schema change is missing from an existing local database:** the schema
  file is applied automatically only when MySQL first creates its data volume.
  Apply the relevant development SQL change to the local database, or reset the
  local volume if its contents can be discarded.

## Safety boundary

This local setup is for development only. Its database credentials and setup
key are placeholders, `debug` is enabled, uploads live in the local checkout,
and the database has no production data. Never copy `server/config.local.php`
to a hosted server, never reuse its credentials, and never expose the local API
or setup endpoint outside your computer.
