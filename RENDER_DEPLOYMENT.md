# Render Deployment Checklist

The crash shown in the Render logs happens before the server starts:

```text
Config validation error: "MONGODB_URL" is required
```

Render does not upload your local `.env` file. Add these variables in the Render service dashboard under **Environment**.

## Required Variables

```env
NODE_ENV=production
MONGODB_URL=mongodb+srv://<user>:<password>@<cluster>/<database>?retryWrites=true&w=majority
JWT_SECRET=<long-random-secret>
RESEND_API_KEY=<your-resend-api-key>
EMAIL_FROM=noreply@yourdomain.com
FRONTEND_URL=https://your-frontend-domain.com
```

`MONGO_URI` or `MONGO_URL` will also work, but `MONGODB_URL` is the preferred name for this project.

## Render Settings

- Build command: `npm install`
- Start command: `npm start`
- Node version: `20.11.0`

If you use `render.yaml`, keep secret values out of the file. The blueprint marks database and email variables with `sync: false`, so Render will ask you to enter them securely.

## MongoDB Atlas Network Access

If the app later fails with a MongoDB connection timeout, update MongoDB Atlas network access:

- For quick testing, allow `0.0.0.0/0`.
- For production, restrict access to Render's outbound IPs if your Render plan provides static outbound IPs.

