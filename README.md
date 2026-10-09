# IntellMeet — Enterprise Workspace Backend

A secure, scalable, production-ready backend service for **IntellMeet Enterprise Workspace**, built with Node.js, Fastify, and MongoDB Atlas.

---

## 📚 API Documentation (Swagger / OpenAPI)

Interactive Swagger API documentation is built-in and automatically served by Fastify:

* **Swagger UI (Interactive API Explorer)**: 👉 **[http://localhost:5000/docs](http://localhost:5000/docs)**
* **OpenAPI Specification (JSON)**: 👉 **[http://localhost:5000/docs/json](http://localhost:5000/docs/json)**

### How to use Swagger UI:
1. Start the server using `npm run dev` or `npm start`.
2. Open `http://localhost:5000/docs` in your web browser.
3. Use the **Authorize** button at the top right to test protected routes by providing your JWT Bearer token (`Bearer <your_token>`).
4. Click **Try it out** on any endpoint to execute requests directly from the documentation UI against the running server and live MongoDB Atlas database.

---

## 🌟 Key Features

* **Authentication & Authorization**:
  * Work email & password registration and login.
  * Rotating refresh tokens with reuse detection security.
  * HttpOnly cookie and Bearer token authentication support.
  * Persistent 30-day session lifetime when "Remember This Device" is checked.
  * Single-session and multi-session revocation (`/auth/logout` & `/auth/logout-all`).
* **Enterprise SSO & OAuth Integrations**:
  * External Provider boundaries for **Google Workspace**, **Microsoft Azure AD / Microsoft 365**, and **SAML 2.0**.
  * Explicit provider configuration checks returning safe error responses (`PROVIDER_NOT_CONFIGURED`) if provider credentials are not set.
* **Password Management**:
  * Cryptographically secure, single-use password reset tokens with short expiry (15m).
  * Auto-revocation of all active sessions upon password reset.
  * Generic responses on password recovery to prevent account enumeration.
* **Enterprise Services**:
  * Contact Sales inquiry processing and status tracking.
  * User profile management.
* **Database & Diagnostics**:
  * Native Mongoose integration with MongoDB Atlas cluster `cluster0.2qc8tnv.mongodb.net`.
  * Startup connectivity check (server does not accept traffic if database connection fails).
  * Health (`/api/v1/health`) and readiness (`/api/v1/ready`) endpoints.
* **Security & Performance**:
  * Fastify JSON Schema validation for all endpoints.
  * Rate limiting on authentication routes.
  * Security headers via `@fastify/helmet`.
  * Strict CORS restriction.

---

## 🏗️ Project Architecture

```text
intellmeet-backend/
├── src/
│   ├── app.js                   # Fastify app builder & plugin registration
│   ├── server.js                # Server entry point & startup database check
│   ├── config/
│   │   ├── env.js               # Environment variables loader & validator
│   │   └── database.js          # Mongoose Atlas connection manager
│   ├── plugins/
│   │   ├── jwt.js               # JWT configuration
│   │   ├── cors.js              # CORS headers configuration
│   │   ├── rate-limit.js        # Request rate limiter
│   │   └── swagger.js           # OpenAPI / Swagger UI documentation (/docs)
│   ├── modules/
│   │   ├── auth/                # Auth routes, controller, service, schema
│   │   ├── users/               # User model, routes, controller, service
│   │   ├── sessions/            # Session model, TTL cleanup, token rotation
│   │   ├── password-reset/      # PasswordReset model & token service
│   │   └── contact-sales/       # ContactSales model, routes, controller
│   ├── middleware/
│   │   ├── authenticate.js      # JWT Bearer token authentication middleware
│   │   └── error-handler.js     # Centralized error handler
│   └── utils/
│       ├── tokens.js            # Token generation & SHA-256 token hashing
│       ├── email.js             # Nodemailer email transport & reset emails
│       └── api-response.js      # Standardized API response wrappers
├── tests/                       # Automated Vitest test suite
│   ├── setup.js
│   ├── health.test.js
│   ├── auth.test.js
│   ├── user.test.js
│   └── contact-sales.test.js
├── .env                         # Environment settings (contains Atlas credentials)
├── .env.example                 # Sanitized template
├── .gitignore                   # Ignores .env and secrets
├── atlas-credentials.env        # Preserved Atlas credentials reference
├── vitest.config.js             # Vitest test configuration
├── package.json
└── README.md
```

---

## 🛠️ Installation & Setup

### Prerequisites

* **Node.js**: v18.0.0 or higher (v22+ recommended)
* **NPM**: v9.0.0 or higher
* **MongoDB Atlas**: Cluster connection details (pre-configured in `.env`)

### Installation Commands

```bash
# Install dependencies
npm install
```

### Environment Configuration

Copy `.env.example` to `.env` if configuring a new environment:

```bash
cp .env.example .env
```

Ensure the following variables are configured in `.env`:

```env
NODE_ENV=development
PORT=5000
HOST=0.0.0.0

MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.2qc8tnv.mongodb.net/intellmeet?retryWrites=true&w=majority

JWT_ACCESS_SECRET=your_long_random_jwt_access_secret
JWT_ACCESS_EXPIRES_IN=15m

JWT_REFRESH_SECRET=your_long_random_jwt_refresh_secret
JWT_REFRESH_EXPIRES_IN=30d

FRONTEND_URL=http://localhost:3000
COOKIE_SECURE=false

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:5000/api/v1/auth/google/callback

MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_TENANT_ID=
MICROSOFT_CALLBACK_URL=http://localhost:5000/api/v1/auth/microsoft/callback

SAML_ENTRY_POINT=
SAML_ISSUER=
SAML_CALLBACK_URL=http://localhost:5000/api/v1/auth/saml/callback
SAML_CERT=

SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=noreply@intellmeet.com

PASSWORD_RESET_URL=http://localhost:3000/reset-password
```

---

## 🚀 Running & Building the Server

### 1. Build Verification

Validates all ES module code and syntax without launching a server:

```bash
npm run build
```

### 2. Development Mode (Auto-reload on file changes)

```bash
npm run dev
```

### 3. Production Mode

```bash
npm start
```

### 4. Swagger API Documentation

Visit **`http://localhost:5000/docs`** to view and test all endpoints interactively.

---

## 🧪 Running Automated Tests

Run the complete Vitest test suite:

```bash
npm test
```

The test suite covers:
* User Registration (Success, Validation errors, Duplicate email rejection)
* Password Login (Valid credentials, Invalid password, Disabled account rejection)
* Refresh Token Rotation & Token Reuse Detection
* Session Revocation & Logout / Logout-all
* Password Recovery & Reset flows
* Protected Endpoint Authorization (`/auth/me`, `/users/me`)
* Contact Sales Inquiry Submission
* Unconfigured External Provider Error Boundaries (Google, Microsoft, SAML)
* Health and Readiness Status Checks against MongoDB Atlas

---

## 📡 REST API Reference

Base URL: `/api/v1`

| Method | Endpoint | Description | Auth Required | Swagger Doc Tag |
|---|---|---|---|---|
| `POST` | `/auth/register` | Create a new user account | No | Auth |
| `POST` | `/auth/login` | Email/password login | No | Auth |
| `POST` | `/auth/refresh` | Rotate refresh token & get new access token | Cookie / Body | Auth |
| `POST` | `/auth/logout` | Revoke current session | Cookie / Body | Auth |
| `POST` | `/auth/logout-all` | Revoke all sessions for user | Bearer Token | Auth |
| `GET` | `/auth/me` | Get details of authenticated user | Bearer Token | Auth |
| `POST` | `/auth/forgot-password` | Request password reset link | No | Auth |
| `POST` | `/auth/reset-password` | Reset password using token | No | Auth |
| `GET` | `/auth/google` | Initiate Google Workspace OAuth | No | Auth / OAuth |
| `GET` | `/auth/google/callback` | Handle Google OAuth callback | No | Auth / OAuth |
| `GET` | `/auth/microsoft` | Initiate Microsoft Azure AD OAuth | No | Auth / OAuth |
| `GET` | `/auth/microsoft/callback` | Handle Microsoft callback | No | Auth / OAuth |
| `GET` | `/auth/saml/login` | Initiate SAML 2.0 Enterprise SSO | No | Auth / SAML |
| `POST` | `/auth/saml/callback` | Handle SAML assertion callback | No | Auth / SAML |
| `GET` | `/users/me` | Get user profile details | Bearer Token | Users |
| `PATCH` | `/users/me` | Update user profile details | Bearer Token | Users |
| `POST` | `/contact-sales` | Submit enterprise sales inquiry | No | Contact Sales |
| `GET` | `/health` | Basic application health check | No | Health |
| `GET` | `/ready` | Check system and MongoDB readiness | No | Health |

---

## 💻 Sample cURL Commands

### 1. Register User

```bash
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Enterprise",
    "email": "jane@example.com",
    "password": "SecurePassword123!",
    "companyName": "Acme Corp"
  }'
```

### 2. Login

```bash
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "jane@example.com",
    "password": "SecurePassword123!",
    "rememberMe": true
  }'
```

### 3. Get User Profile

```bash
curl -X GET http://localhost:5000/api/v1/auth/me \
  -H "Authorization: Bearer <ACCESS_TOKEN_HERE>"
```

### 4. Refresh Token

```bash
curl -X POST http://localhost:5000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "<REFRESH_TOKEN_HERE>"
  }'
```

### 5. Forgot Password

```bash
curl -X POST http://localhost:5000/api/v1/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "jane@example.com"
  }'
```

### 6. Contact Sales

```bash
curl -X POST http://localhost:5000/api/v1/contact-sales \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Alex Smith",
    "workEmail": "alex@enterprise.com",
    "company": "Enterprise Global",
    "companySize": "1000+",
    "message": "We would like to request an enterprise trial of IntellMeet."
  }'
```

---

## 🔒 Enterprise Provider Configurations

### Google Workspace OAuth Configuration
1. Register a web application in the Google Cloud Console.
2. Add `http://localhost:5000/api/v1/auth/google/callback` to Authorized Redirect URIs.
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`.

### Microsoft Azure AD / Microsoft 365 Configuration
1. Register an application in Microsoft Entra ID (Azure AD).
2. Set `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, and `MICROSOFT_TENANT_ID` in `.env`.

### SAML 2.0 Enterprise SSO Configuration
1. Register IntellMeet as a Service Provider (SP) in your Identity Provider (Okta, Azure AD SAML, PingIdentity).
2. Set `SAML_ENTRY_POINT`, `SAML_ISSUER`, and `SAML_CERT` in `.env`.

If provider credentials are missing, the server responds safely with HTTP 501:
```json
{
  "success": false,
  "message": "Google Workspace authentication is not configured on this server.",
  "error": {
    "code": "PROVIDER_NOT_CONFIGURED"
  }
}
```

---

## 📜 License

MIT License. Developed for IntellMeet Enterprise Workspace.
