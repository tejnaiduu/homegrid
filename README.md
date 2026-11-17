# Homegrid

## Deploy with Vercel, Render, and MongoDB Atlas

The frontend is a Vite app in `client/`; the API is an Express app in `server/`.
Deploy the API and frontend as separate services, and use MongoDB Atlas for the
database.

### 1. Push the project to GitHub

Vercel and Render deploy from a Git repository. Push this project to a GitHub
repository without committing `.env` files, local cookie files, or credentials.

### 2. Create the MongoDB Atlas database

Create an Atlas cluster and database user, then copy its connection string. In
Atlas Network Access, allow connections from Render (for a quick setup, `0.0.0.0/0`
allows access from any IP; use a narrower network policy if you have fixed egress
IP addresses). Keep the connection string private.

### 3. Create the Vercel project

Import the GitHub repository into Vercel and set **Root Directory** to `client`.
Vercel assigns the project an HTTPS domain, which is needed to configure the API.
You can deploy the frontend once before the API is ready; its API calls will not
work until the next step is complete.

### 4. Deploy the API on Render

In Render, create a **Blueprint** from the GitHub repository. Render will read
`render.yaml` and create the API service. Supply the Atlas connection string for
`MONGODB_URI`, and set `CLIENT_URL` to the Vercel project's exact HTTPS origin,
without a trailing slash (for example, `https://homegrid.vercel.app`). Render
generates `JWT_SECRET`.

### 5. Finish the frontend deployment

In Vercel, set `VITE_API_URL` to the Render API URL followed by `/api/v1`, for
example:

```text
https://homegrid-api.onrender.com/api/v1
```

Redeploy the frontend. If you change either domain, update the corresponding
environment variable and redeploy/restart the affected service.
`client/vercel.json` enables client-side route fallback for direct links and
page refreshes.

The Render configuration uses secure cross-site cookies because the default
Vercel and Render domains are on different sites. Some browsers restrict
third-party cookies; using custom frontend and API domains under the same
registrable domain (for example, `app.example.com` and `api.example.com`) is
recommended for reliable sign-in.