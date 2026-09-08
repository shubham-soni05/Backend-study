# Complete Authentication System — Step-by-Step Guide

> JWT · Access Token · Refresh Token · Token Rotation · Sessions · Logout · Logout From All Devices · OTP Email Verification · Token Blacklisting

**Source video:** https://youtu.be/pkKn8q5AvsY (Sheryians Coding School)
**Stack:** Node.js · Express · MongoDB (Mongoose) · JWT · Nodemailer

This document explains the *what*, the *why*, and the *how* for every folder, every file, and every important concept, so you can build the whole system by reading this alone — no need to watch the full video.

---

## Table of Contents

1. [What is Authentication? (the core idea)](#1-what-is-authentication)
2. [How the server identifies a user (the token flow)](#2-how-the-server-identifies-a-user)
3. [Access Token vs Refresh Token (and why we need both)](#3-access-token-vs-refresh-token)
4. [Where to store tokens on the client (localStorage vs cookies vs memory)](#4-where-to-store-tokens)
5. [Project setup](#5-project-setup)
6. [Folder & file structure explained](#6-folder--file-structure-explained)
7. [Step 1 — Basic Express server](#step-1--basic-express-server)
8. [Step 2 — Environment variables & config](#step-2--environment-variables--config)
9. [Step 3 — Connect to MongoDB](#step-3--connect-to-mongodb)
10. [Step 4 — User model](#step-4--user-model)
11. [Step 5 — Routes & controllers structure](#step-5--routes--controllers-structure)
12. [Step 6 — Register API](#step-6--register-api)
13. [Step 7 — `/get-me` (identify the requesting user)](#step-7--get-me)
14. [Step 8 — Access + Refresh tokens](#step-8--access--refresh-tokens)
15. [Step 9 — Refresh endpoint & token rotation](#step-9--refresh-endpoint--token-rotation)
16. [Step 10 — Session model](#step-10--session-model)
17. [Step 11 — Logout (single device)](#step-11--logout-single-device)
18. [Step 12 — Token blacklisting (concept)](#step-12--token-blacklisting)
19. [Step 13 — Logout from all devices](#step-13--logout-from-all-devices)
20. [Step 14 — Login API](#step-14--login-api)
21. [Step 15 — OTP email verification](#step-15--otp-email-verification)
22. [Final `.env` file](#final-env-file)
23. [Complete API list](#complete-api-list)

---

## 1. What is Authentication?

Imagine an Instagram server with an API endpoint:

```
POST /api/post/like/:postId
```

Any user who hits this endpoint is saying "I want to like post X". Now suppose three users exist: **A**, **B**, and **C**. A request arrives at the server. **Which user sent it?**

Just by looking at the raw request, the server *cannot* tell. You could guess, but you cannot be 100% sure.

> **Authentication = identifying which user a request is coming from.**

That's the whole idea. Everything else (tokens, sessions, OTP) is just *machinery* to do that identification reliably and securely.

---

## 2. How the server identifies a user

The flow starts at **Register**:

1. A user visits the app. Before doing anything (like/comment/transfer), they must **register**.
2. During register, the user sends their details (username, email, password) to the server.
3. The server **saves those details in the database**. MongoDB assigns the saved record a unique `_id`.
4. The server **creates a token**. Inside the token it stores that user's `_id`.
5. The server does **not** keep the token — it sends the token back to the user in the response.

After registration, on **every subsequent request**, the user must send this token along. Whether they make 10 requests or 1,00,000 requests, the token goes with each one.

**How the server uses it:** the server reads the token → extracts the user id inside → now it knows exactly which user is making the request.

```
Register  →  save user in DB  →  create token (contains user id)  →  send token to user
Later     →  user sends token with every request  →  server reads token  →  identifies user
```

**Why generate a token again at login?** Because:
- Tokens **expire** after some time (1 hour, 1 day, 1 week — depends on the site).
- If a user logs in from another device, they need a fresh token for that device.

**The core problem (previewed here, solved later):** if user **B** somehow steals user **A**'s token and sends it, the server would think the request is from A. This is what the rest of the system defends against.

---

## 3. Access Token vs Refresh Token

We use **two** tokens for proper security:

| Token | Lifetime | Purpose | Stored where (client) |
|-------|----------|---------|-----------------------|
| **Access Token** | Very short (10–15 min) | Used on normal requests so the server can identify the user | In-memory (a JS variable) |
| **Refresh Token** | Long (7–15 days) | Used *only* to generate a new access token | HTTP-only cookie |

- The **access token** behaves like the "normal" token — the server reads it to know who is requesting.
- The **refresh token** has exactly one job: mint a new access token when the old one expires.
- The frontend is written so that when the access token expires, it silently calls the **refresh** endpoint (sending the refresh token) to get a new access token, then continues.

---

## 4. Where to store tokens

This is the crux of the security design. Three client-side storage options exist:

**a) localStorage** — ❌ Bad.
Persists even after the browser closes, but any client-side JavaScript can read it. An attacker only needs to run a script on your page (XSS) to steal the token instantly.

**b) Cookies (HTTP-only)** — ⚠️ Partial.
With `httpOnly`, client-side JS *cannot* read the cookie. But an attacker can still create a hidden form and submit it (CSRF); the browser auto-attaches the cookie, so the request goes through even without reading the token.

**c) Memory (a variable)** — ⚠️ Partial.
JS can't be easily read by an attacker, but memory is wiped on **page reload** — the token is lost.

**The solution — combine them:**
- Store the **access token in memory**. Even if a CSRF form is submitted, the cookie doesn't carry the access token, so sensitive actions are blocked. It can't be read from memory either.
- Store the **refresh token in an HTTP-only cookie**. Client JS can't read it. And critically, **the refresh token is never accepted for normal/sensitive actions** — it only works on the `/refresh` endpoint to mint access tokens. So even if a CSRF form reaches the server carrying the refresh cookie, the server rejects it for transactions.
- When the page reloads and memory clears, the frontend calls `/refresh` (cookie auto-sent) to get a fresh access token back into memory.

This access-token-in-memory + refresh-token-in-httpOnly-cookie combination is the industry-standard pattern.

---

## 5. Project setup

```bash
npm init -y                       # create package.json
npm i express mongoose            # web server + MongoDB ODM
npm i morgan                      # HTTP request logger
npm i dotenv                      # load .env variables
npm i cookie-parser               # read cookies
npm i jsonwebtoken                # create/verify JWTs
npm i nodemailer                  # send OTP emails
npm i -D nodemon                  # auto-restart in dev
```

> `crypto` is built into Node.js — no install needed. It is used to hash passwords, refresh tokens, and OTPs.

In `package.json` add `"type": "module"` so you can use `import` statements, and add a dev script:

```json
{
  "type": "module",
  "scripts": {
    "dev": "npx nodemon server.js"
  }
}
```

> **Note on ESM imports:** with `"type": "module"` you **must** add the `.js` extension on local imports (e.g. `import app from "./src/app.js"`). Node made this intentional to avoid ambiguity. It feels annoying but prevents confusing bugs later.

---

## 6. Folder & file structure explained

```
backend/
├── server.js                      # ENTRY POINT: starts server + connects DB
├── .env                           # secrets & config (never commit this)
├── package.json
└── src/
    ├── app.js                     # Express app: middleware & route mounting
    ├── config/
    │   └── config.js              # reads/validates env vars, exports a config object
    │   └── database.js            # connectToDB() function
    ├── models/
    │   ├── user.model.js          # what a user looks like in the DB
    │   ├── session.model.js       # one record per logged-in device
    │   └── otp.model.js           # stores hashed OTPs for email verification
    ├── routes/
    │   └── auth.routes.js         # DECLARES endpoints (no logic here)
    ├── controllers/
    │   └── auth.controller.js     # the actual LOGIC for each endpoint
    ├── services/
    │   └── email.service.js       # Nodemailer transporter + sendEmail()
    └── utils/
        └── utils.js               # helpers: generateOTP(), getOtpHtml()
```

**Why each folder exists:**

- **`config/`** — Centralizes environment configuration. Instead of scattering `process.env.X` everywhere, you read + **validate** every required variable in one place. If a required var is missing, the server refuses to start with a clear error. This is a huge quality-of-life win for teammates who clone the repo fresh.
- **`models/`** — Defines the *shape* (schema) of each MongoDB collection. A model is your typed gateway to the database.
- **`routes/`** — Only **declares** the API surface: which HTTP method + path maps to which controller. No business logic lives here. Keeps the API map readable at a glance.
- **`controllers/`** — Contains the actual work each endpoint does (validation, DB queries, token creation, responses). Separating routes from controllers keeps both clean and testable.
- **`services/`** — Reusable integrations with external systems (here: email/SMTP). Kept separate so controllers stay focused on request handling.
- **`utils/`** — Small stateless helper functions used across the app (OTP generation, HTML templates).

---

## Step 1 — Basic Express server

**`src/app.js`** — the Express application (middleware + routes):

```js
import express from "express";
import morgan from "morgan";

const app = express();

// express.json() lets us read JSON from req.body
app.use(express.json());

// morgan "dev" logs: method, endpoint, status code, response time
app.use(morgan("dev"));

export default app;
```

> **What is a logger?** Morgan tells you which request hit the server, its method, which endpoint, the status code, and how long the response took. Modes like `combined`/`common`/`dev`/`short` vary in detail. `dev` is short and perfect for development.

**`server.js`** — the entry point. Two jobs: start the server, connect the DB.

```js
import app from "./src/app.js";     // NOTE the .js extension

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
```

Run it:

```bash
npm run dev
```

---

## Step 2 — Environment variables & config

Create **`.env`** in the project root. This is where secrets and config live — never in plain code, never committed to git.

```env
MONGO_URI=your-mongodb-connection-string
```

Create **`src/config/config.js`**. It loads `.env`, validates required vars, and exports a clean config object.

```js
import dotenv from "dotenv";
dotenv.config();   // MUST be called before reading process.env

// Fail fast if a required variable is missing
if (!process.env.MONGO_URI) {
  throw new Error("MONGO_URI is not defined in environment variables");
}

const config = {
  MONGO_URI: process.env.MONGO_URI,
};

export default config;
```

> **Why validate here?** When a new junior clones the repo and runs the server without setting env vars, they immediately get a clear error naming the exact missing variable — instead of a cryptic crash deep in the code.

---

## Step 3 — Connect to MongoDB

### Create a MongoDB Atlas cluster (one-time)

1. Go to **MongoDB Atlas** → sign up / sign in.
2. Create a **Project** (e.g. `yt-auth`).
3. Create a **free cluster**, pick a region (e.g. Mumbai), and deploy.
4. **Network Access → IP Access List:** for development add `0.0.0.0/0` (allows all IPs). This is only for dev because your home/mobile IP keeps changing. **In production, whitelist only your server's static IP.**
5. **Database Access:** create a database user (e.g. `yt-auth-server`), generate a password, give it the built-in **Atlas admin** role. Copy the password.
6. Get the connection URI (Compass/driver format) and replace the `<password>` placeholder with your real password. Put the full URI in `.env` as `MONGO_URI`.
7. Optionally install **MongoDB Compass** (desktop app) to *view* the data your DB stores. That's its only real job for now.

> **Tip:** By default the connection points to a `test` database. To use a named DB, append the name in the URI or set it, and use a var like `MONGO_URI` that already includes the DB name (the video names the DB `main-auth`).

### Create **`src/config/database.js`**

```js
import mongoose from "mongoose";
import config from "./config.js";   // NOTE the .js extension

const connectToDB = async () => {
  await mongoose.connect(config.MONGO_URI);
  console.log("Connected to DB");
};

export default connectToDB;
```

### Wire it into **`server.js`**

```js
import app from "./src/app.js";
import connectToDB from "./src/config/database.js";

connectToDB();

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
```

Now `npm run dev` starts the server **and** connects to the database.

---

## Step 4 — User model

**`src/models/user.model.js`** — defines what a user record looks like.

```js
import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, "Username is required"],
    unique: true,                 // "username must be unique"
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  verified: {                     // added later for OTP flow
    type: Boolean,
    default: false,
  },
});

const userModel = mongoose.model("users", userSchema);

export default userModel;
```

- `unique: true` on `username` and `email` prevents duplicate accounts.
- `verified` defaults to `false` — the user cannot fully use the app until they verify their email (see Step 15).

---

## Step 5 — Routes & controllers structure

**`src/routes/auth.routes.js`** — declares endpoints only.

```js
import { Router } from "express";
import * as authController from "../controllers/auth.controller.js";

const authRouter = Router();

authRouter.post("/register", authController.register);

export default authRouter;
```

Mount it in **`src/app.js`** with a prefix:

```js
import authRouter from "./routes/auth.routes.js";

app.use("/api/auth", authRouter);
```

Because of the `/api/auth` prefix, the register endpoint's full path becomes:

```
POST /api/auth/register
```

> **Route vs Controller:** the route file *declares* ("this method + path exists"). The controller file *defines* the logic ("here's exactly what happens"). This separation keeps the API map readable and the logic organized.

---

## Step 6 — Register API

**`src/controllers/auth.controller.js`**

```js
import crypto from "crypto";
import jwt from "jsonwebtoken";
import userModel from "../models/user.model.js";
import config from "../config/config.js";

export async function register(req, res) {
  const { username, email, password } = req.body;

  // 1. Check if a user with this username OR email already exists
  const isAlreadyRegistered = await userModel.findOne({
    $or: [{ username }, { email }],
  });

  if (isAlreadyRegistered) {
    // 409 = Conflict (resource already exists)
    return res.status(409).json({
      message: "Username or email already exists",
    });
  }

  // 2. Hash the password — never store plain text
  const hashedPassword = crypto
    .createHash("sha256")
    .update(password)
    .digest("hex");

  // 3. Create the user
  const user = await userModel.create({
    username,
    email,
    password: hashedPassword,
  });

  // 4. Create a token containing the user's id
  const token = jwt.sign({ id: user._id }, config.JWT_SECRET, {
    expiresIn: "1d",
  });

  // 201 = Created (a new resource was created on the server)
  return res.status(201).json({
    message: "User registered successfully",
    user: { username: user.username, email: user.email },
    token,
  });
}
```

**Key points:**

- **`$or` query:** finds a user matching *either* the username *or* the email — so we detect duplicates on both fields at once.
- **Why hash the password?** If the database ever leaks, plain-text passwords would hand attackers direct account access. Hashing (here with `crypto` + SHA-256, `hex` digest) stores an irreversible fingerprint instead.
- **`409`** means "conflict" (already exists). **`201`** means "created" — correct when a request causes a new resource to be created server-side.

### JWT secret

The JWT is signed with a **secret**. The server later uses the same secret to verify a token was genuinely created by *this* server. If verification fails, the server responds `401 Unauthorized`.

Generate a secret at **https://jwtsecret.com** (choose a length — longer = more secure but more compute; find a balance). Put it in `.env`:

```env
JWT_SECRET=your-generated-secret
```

Validate it in **`config.js`**:

```js
if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is not defined in environment variables");
}
// add to the exported config object:
// JWT_SECRET: process.env.JWT_SECRET,
```

### Test with Postman

```
POST http://localhost:3000/api/auth/register
Body (raw / JSON):
{
  "username": "test",
  "email": "test@test.com",
  "password": "test"
}
```

You should get `201` with the username, email, and a token. A JWT looks like three base64 sections separated by dots.

---

## Step 7 — /get-me

Goal: an endpoint where the server identifies the requesting user from their token and returns that user's own details.

Add the route in **`auth.routes.js`**:

```js
authRouter.get("/get-me", authController.getMe);
```

Full path: `GET /api/auth/get-me`.

### How the token arrives

The client sends the token in the **Authorization header** using the industry-standard `Bearer` scheme:

```
Authorization: Bearer <token>
```

That's the word `Bearer`, a space, then the token. So on the server we split by space to extract just the token.

### Controller

```js
export async function getMe(req, res) {
  // 1. Read the token from the Authorization header: "Bearer <token>"
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Token not found" });
  }

  // 2. Verify the token using the same secret it was signed with
  const decoded = jwt.verify(token, config.JWT_SECRET);
  // decoded = { id, iat, exp }
  //   id  = the user id we put in during register
  //   iat = issued-at (when token was created)
  //   exp = expiry timestamp

  // 3. Find the full user by that id
  const user = await userModel.findById(decoded.id);

  return res.status(200).json({
    username: user.username,
    email: user.email,
    message: "User fetched successfully",
  });
}
```

**Test:** set header `Authorization: Bearer <token-from-register>` and `GET /api/auth/get-me` → you get back that user's details.

> **Tip:** Besides Postman, the VS Code extension **Thunder Client** works similarly. In the video, Postman represents one user (device) and Thunder Client another, to demonstrate two logged-in clients.

**The vulnerability demonstrated:** if user *test2* uses user *test*'s token, the server returns *test*'s data — it trusts whoever holds the token. On a banking `/transaction` endpoint this would let a thief transfer money from the victim's account. This is exactly why token storage (Step 4) and short-lived access tokens matter.

---

## Step 8 — Access + Refresh tokens

Now upgrade **register** (and later **login**) to issue two tokens.

```js
// Access token — SHORT lived (15 min). Used for normal requests.
const accessToken = jwt.sign({ id: user._id }, config.JWT_SECRET, {
  expiresIn: "15m",
});

// Refresh token — LONG lived (7 days). Only used to mint new access tokens.
const refreshToken = jwt.sign({ id: user._id }, config.JWT_SECRET, {
  expiresIn: "7d",
});
```

- The **access token** is sent in the **response body** (frontend keeps it in memory).
- The **refresh token** is set in an **HTTP-only cookie** so client-side JS cannot read it.

Install and wire up the cookie parser.

**`src/app.js`:**

```js
import cookieParser from "cookie-parser";
app.use(cookieParser());
```

Set the refresh token cookie in the controller:

```js
res.cookie("refreshToken", refreshToken, {
  httpOnly: true,      // client-side JS cannot read this cookie
  secure: true,        // only sent over HTTPS
  sameSite: "strict",  // CSRF protection
  maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days in ms
});
```

Then send the access token in the response:

```js
return res.status(201).json({
  message: "User registered successfully",
  user: { username: user.username, email: user.email },
  accessToken,
});
```

> **`httpOnly` meaning:** the JavaScript running on the client can never read the cookie's contents. This is the key protection for the refresh token.

**Test (register):** the response body carries the **access token**; the **refresh token** shows up in the cookie jar.

---

## Step 9 — Refresh endpoint & token rotation

When the short-lived access token expires, the client calls `/refresh` (the refresh-token cookie is sent automatically) to get a new access token.

Route:

```js
authRouter.get("/refresh-token", authController.refreshToken);
```

Controller:

```js
export async function refreshToken(req, res) {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    return res.status(401).json({ message: "Unauthorized, refresh token not found" });
  }

  // Verify the refresh token
  const decoded = jwt.verify(refreshToken, config.JWT_SECRET);

  // Mint a NEW access token (15 min)
  const accessToken = jwt.sign({ id: decoded.id }, config.JWT_SECRET, {
    expiresIn: "15m",
  });

  // TOKEN ROTATION: also mint a NEW refresh token (7 days) for extra security
  const newRefreshToken = jwt.sign({ id: decoded.id }, config.JWT_SECRET, {
    expiresIn: "7d",
  });

  res.cookie("refreshToken", newRefreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  return res.status(200).json({
    message: "Access token refreshed successfully",
    accessToken,
  });
}
```

> **Why rotate the refresh token too?** A refresh token lives ~7 days. If someone briefly copies the cookie, they could keep minting access tokens for a week. By issuing a **new** refresh token on every refresh and **invalidating the old one** (implemented via sessions in Step 10), a leaked token becomes useless within ~15 minutes.

**Test:** hit `GET /api/auth/refresh-token` — the cookie is sent automatically, you receive a new access token, and both tokens change on reload.

This access + refresh pattern with no problems is exactly what you'll see in industry. The remaining steps add session-based revocation for logout.

---

## Step 10 — Session model

To support logout (and logout-from-all-devices), we track **one session per logged-in device** on the server.

A user typically has multiple devices (phone, laptop, tablet, desktop — up to ~4 common). Each device gets a session.

**What a session stores:**
- `user` — which user this session belongs to
- `refreshTokenHash` — the refresh token **hashed** (never store it raw: if the DB leaks, a raw refresh token would let an attacker mint access tokens)
- `ip` — the IP the session runs from
- `userAgent` — browser/device string
- `revoked` — `false` by default; set to `true` on logout
- timestamps (`createdAt`, `updatedAt`)

**`src/models/session.model.js`:**

```js
import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    refreshTokenHash: {
      type: String,
      required: true,
    },
    ip: {
      type: String,
      required: true,
    },
    userAgent: {
      type: String,
    },
    revoked: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }   // auto createdAt & updatedAt
);

const sessionModel = mongoose.model("sessions", sessionSchema);

export default sessionModel;
```

> **What is a User-Agent?** A browser string that identifies which browser and version the client uses — useful for showing "active sessions" and for security auditing.

### Create a session on register/login

When creating the refresh token, also create a session and store the **hash** of the refresh token:

```js
// refresh token already created above
const refreshTokenHash = crypto
  .createHash("sha256")
  .update(refreshToken)
  .digest("hex");

const session = await sessionModel.create({
  user: user._id,
  refreshTokenHash,
  ip: req.ip,
  userAgent: req.headers["user-agent"],
});
```

Optionally include the **session id** inside the access token so you can reference the session later:

```js
const accessToken = jwt.sign(
  { id: user._id, sessionId: session._id },
  config.JWT_SECRET,
  { expiresIn: "15m" }
);
```

### Update the refresh flow to validate & update the session

In the `/refresh` controller, before minting new tokens, confirm the session exists and is **not revoked**:

```js
const refreshTokenHash = crypto
  .createHash("sha256").update(refreshToken).digest("hex");

const session = await sessionModel.findOne({
  refreshTokenHash,
  revoked: false,
});

if (!session) {
  // Either the refresh token is wrong, or the session was revoked (logged out)
  return res.status(401).json({ message: "Invalid refresh token" });
}

// ... mint new access + refresh tokens (rotation) ...

// Because the refresh token changed, update its hash in the session:
const newRefreshTokenHash = crypto
  .createHash("sha256").update(newRefreshToken).digest("hex");

session.refreshTokenHash = newRefreshTokenHash;
await session.save();
```

---

## Step 11 — Logout (single device)

Logout is simple: find the session for the incoming refresh token and set `revoked: true`, then clear the cookie.

Route:

```js
authRouter.get("/logout", authController.logout);
```

Controller:

```js
export async function logout(req, res) {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    return res.status(400).json({ message: "Refresh token not found" });
  }

  // The DB stores the HASH, so hash the incoming token to find the session
  const refreshTokenHash = crypto
    .createHash("sha256").update(refreshToken).digest("hex");

  const session = await sessionModel.findOne({
    refreshTokenHash,
    revoked: false,
  });

  if (!session) {
    return res.status(400).json({ message: "Invalid refresh token" });
  }

  session.revoked = true;
  await session.save();

  res.clearCookie("refreshToken");

  return res.status(200).json({ message: "Logged out successfully" });
}
```

After logout, the session is `revoked: true`, so that refresh token can no longer mint new access tokens — `/refresh` will return "Invalid refresh token".

> **Note:** use `return` on each early-exit `if` branch so the function stops correctly.

---

## Step 12 — Token blacklisting

**The gap:** After logout, the refresh token is revoked — but the **access token** is still valid until it expires (up to 15 min). During that window the user could still act.

**Solution — token blacklisting:** on logout, add the access token to a **blacklist** (typically stored in a high-throughput store like **Redis**). On every identifying request, the server checks the blacklist; if the token is there, it rejects the request as "logged out".

**The trade-off:**
- Blacklisting gives **instant** logout everywhere, **but** it breaks JWT's stateless advantage — now every request needs a DB/Redis lookup, adding cost and latency at scale.
- Big companies often instead keep access tokens **very short-lived** (e.g. 10 min). After revoking the refresh token, the access token simply expires on its own within minutes, and can't be renewed (refresh is revoked). No per-request lookup needed.

Choose based on need: instant revocation (blacklist, higher cost/latency) vs. short-lived tokens (slight delay, cheaper and stateless).

---

## Step 13 — Logout from all devices

Revoke **every** non-revoked session for the user in one shot.

Route:

```js
authRouter.get("/logout-all", authController.logoutAll);
```

Controller:

```js
export async function logoutAll(req, res) {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    return res.status(400).json({ message: "Refresh token not found" });
  }

  const decoded = jwt.verify(refreshToken, config.JWT_SECRET);

  // Revoke ALL active sessions for this user
  await sessionModel.updateMany(
    { user: decoded.id, revoked: false },
    { revoked: true }
  );

  res.clearCookie("refreshToken");

  return res.status(200).json({
    message: "Logged out from all devices successfully",
  });
}
```

**Test:** log in on two clients (Postman + Thunder Client), call `logout-all` from one → afterwards *neither* client can rotate/refresh tokens ("Invalid / refresh token not found") because all their sessions are revoked.

---

## Step 14 — Login API

The most basic feature, added late in the video. Login verifies credentials, then issues access + refresh tokens and creates a session — but only if the user's email is verified (see Step 15).

Route:

```js
authRouter.post("/login", authController.login);
```

Controller:

```js
export async function login(req, res) {
  const { email, password } = req.body;

  // 1. Find user by email
  const user = await userModel.findOne({ email });
  if (!user) {
    return res.status(401).json({ message: "Invalid email or password" });
  }

  // 2. Compare passwords (hash the incoming one and compare)
  const hashedPassword = crypto
    .createHash("sha256").update(password).digest("hex");
  const isValidPassword = hashedPassword === user.password;
  if (!isValidPassword) {
    return res.status(401).json({ message: "Invalid email or password" });
  }

  // 3. Block login until email is verified (OTP flow — Step 15)
  if (!user.verified) {
    return res.status(401).json({ message: "Email not verified" });
  }

  // 4. Issue refresh token + create session
  const refreshToken = jwt.sign({ id: user._id }, config.JWT_SECRET, {
    expiresIn: "7d",
  });
  const refreshTokenHash = crypto
    .createHash("sha256").update(refreshToken).digest("hex");

  const session = await sessionModel.create({
    user: user._id,
    refreshTokenHash,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
  });

  // 5. Issue access token (include sessionId)
  const accessToken = jwt.sign(
    { id: user._id, sessionId: session._id },
    config.JWT_SECRET,
    { expiresIn: "15m" }
  );

  // 6. Set refresh cookie + return access token
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  return res.status(200).json({
    message: "Logged in successfully",
    user: { username: user.username, email: user.email },
    accessToken,
  });
}
```

**Test:**
```
POST http://localhost:3000/api/auth/login
{ "email": "test@test.com", "password": "test" }
```

---

## Step 15 — OTP email verification

**Why:** Ensure the email is real before granting full access. Blocks bots/spammers/competitors from mass-creating fake accounts and burning your server resources. The user must prove they own the email by entering an OTP.

**Flow:**
1. On **register**, create the user with `verified: false`, generate an OTP, store its **hash**, and **email** the OTP. Do **not** issue access/refresh tokens yet.
2. User submits the OTP to a `/verify-email` endpoint.
3. If the OTP hash matches, set `verified: true`, delete the OTP records. Now login works.

### Set up Nodemailer with Gmail (OAuth2)

You need Google OAuth2 credentials so Nodemailer can send mail through Gmail:

1. **Google Cloud Console** → create a new project (e.g. `yt-auth`) → select it.
2. **APIs & Services → Library** → search **Gmail API** → **Enable**.
3. **OAuth consent screen** → fill basic details (app name, support email), audience = **External**, finish.
4. **Audience → Test users** → add your own Gmail address (required, or sending will be blocked).
5. **Credentials → Create credentials → OAuth client ID** → application type **Web application** → add authorized redirect URIs:
   - `http://localhost`
   - `https://developers.google.com/oauthplayground`
   Create → copy **Client ID** and **Client Secret** into `.env`.
6. Go to **OAuth 2.0 Playground** (https://developers.google.com/oauthplayground):
   - Click the gear (settings) → check **Use your own OAuth credentials** → paste Client ID + Client Secret.
   - In the API list, select **Gmail API v1** scope (`https://mail.google.com/`) → **Authorize APIs**.
   - Choose the same Google account you added as a test user → allow.
   - **Exchange authorization code for tokens** → copy the **Refresh Token**.
7. Put all four values in `.env`:

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
GOOGLE_USER=your-gmail@gmail.com
```

Validate & export them in **`config.js`** (throw if any is missing).

Install Nodemailer:

```bash
npm i nodemailer
```

### Email service — **`src/services/email.service.js`**

```js
import nodemailer from "nodemailer";
import config from "../config/config.js";

// The transporter talks to the SMTP server that actually sends the mail.
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    type: "OAuth2",
    user: config.GOOGLE_USER,
    clientId: config.GOOGLE_CLIENT_ID,
    clientSecret: config.GOOGLE_CLIENT_SECRET,
    refreshToken: config.GOOGLE_REFRESH_TOKEN,
  },
});

// Good practice: verify credentials at startup
transporter.verify((error) => {
  if (error) console.log("Email transporter error:", error);
  else console.log("Email transporter ready");
});

export async function sendEmail({ to, subject, text, html }) {
  const info = await transporter.sendMail({
    from: config.GOOGLE_USER,
    to,
    subject,
    text,
    html,
  });
  return info;
}
```

> **What is a transporter?** The object that handles all communication with the SMTP server (the servers that actually deliver email). You send mail *through* the transporter.

### OTP helpers — **`src/utils/utils.js`**

```js
// Generate a 6-digit OTP
export function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Build the HTML body the OTP is embedded in (emails are sent as HTML)
export function getOtpHtml(otp) {
  return `
    <div style="font-family: sans-serif;">
      <h2>OTP Verification</h2>
      <p>Your OTP code:</p>
      <div style="font-size: 24px; font-weight: bold; color: #333;">${otp}</div>
      <p>Please use this code to verify your email address.</p>
    </div>
  `;
}
```

### OTP model — **`src/models/otp.model.js`**

```js
import mongoose from "mongoose";

const otpSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
    },
    otpHash: {                    // store the HASH, not the raw OTP
      type: String,
      required: [true, "OTP is required"],
    },
  },
  { timestamps: true }
);

const otpModel = mongoose.model("otps", otpSchema);

export default otpModel;
```

> Only the **user** ever sees the real OTP (via email). The server stores just its hash — even the server can't read the raw OTP back.

### Update **register** to send OTP (no tokens yet)

```js
import { generateOTP, getOtpHtml } from "../utils/utils.js";
import { sendEmail } from "../services/email.service.js";
import otpModel from "../models/otp.model.js";

// inside register(), after creating the user with verified:false ...

const otp = generateOTP();
const otpHtml = getOtpHtml(otp);

// Store the OTP hash in DB
const otpHash = crypto.createHash("sha256").update(otp).digest("hex");
await otpModel.create({
  email: user.email,
  user: user._id,
  otpHash,
});

// Send the OTP email
await sendEmail({
  to: req.body.email,
  subject: "OTP Verification",
  text: "Welcome to our app. Thank you for registration.",
  html: otpHtml,
});

return res.status(201).json({
  message: "User registered successfully",
  user: { username: user.username, email: user.email, verified: user.verified },
});
```

> Register no longer returns access/refresh tokens. Tokens are only issued at **login**, and login is blocked until `verified === true`.

### Verify-email endpoint

Route:

```js
authRouter.post("/verify-email", authController.verifyEmail);
```

Controller:

```js
export async function verifyEmail(req, res) {
  const { otp, email } = req.body;

  // Hash the submitted OTP and find a matching record for this email
  const otpHash = crypto.createHash("sha256").update(otp).digest("hex");

  const otpDoc = await otpModel.findOne({ email, otpHash });

  if (!otpDoc) {
    // Wrong OTP, or this email never registered
    return res.status(400).json({ message: "Invalid OTP" });
  }

  // Mark the user verified
  const user = await userModel.findByIdAndUpdate(
    otpDoc.user,
    { verified: true },
    { new: true }
  );

  // Clean up all OTPs for this email (a user may have several)
  await otpModel.deleteMany({ email });

  return res.status(200).json({
    message: "Email verified successfully",
    user: { username: user.username, email: user.email, verified: user.verified },
  });
}
```

**Test end-to-end:**
1. `POST /api/auth/register` with a **real** email → response shows `verified: false`; OTP arrives in your inbox.
2. Try `POST /api/auth/login` → blocked with "Email not verified".
3. `POST /api/auth/verify-email` with `{ "email": "...", "otp": "123456" }` → "Email verified successfully".
4. `POST /api/auth/login` again → now you get access + refresh tokens.

---

## Final `.env` file

```env
# Database
MONGO_URI=mongodb+srv://<user>:<password>@cluster.../main-auth

# JWT
JWT_SECRET=your-long-random-secret

# Google OAuth2 (for Nodemailer / Gmail)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
GOOGLE_USER=your-gmail@gmail.com
```

Corresponding validation block in **`config.js`**:

```js
import dotenv from "dotenv";
dotenv.config();

const required = [
  "MONGO_URI",
  "JWT_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REFRESH_TOKEN",
  "GOOGLE_USER",
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`${key} is not defined in environment variables`);
  }
}

const config = {
  MONGO_URI: process.env.MONGO_URI,
  JWT_SECRET: process.env.JWT_SECRET,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_REFRESH_TOKEN: process.env.GOOGLE_REFRESH_TOKEN,
  GOOGLE_USER: process.env.GOOGLE_USER,
};

export default config;
```

---

## Complete API list

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/auth/register` | Create user (`verified:false`), send OTP email |
| POST | `/api/auth/verify-email` | Verify OTP → set `verified:true` |
| POST | `/api/auth/login` | Verify credentials → issue access + refresh tokens, create session (only if verified) |
| GET  | `/api/auth/get-me` | Identify user from access token, return their details |
| GET  | `/api/auth/refresh-token` | Use refresh cookie → mint new access token (rotate refresh) |
| GET  | `/api/auth/logout` | Revoke current session, clear cookie |
| GET  | `/api/auth/logout-all` | Revoke all sessions for the user |

---

## Concept recap

- **Authentication** = identifying which user a request comes from.
- **JWT** carries the user id and is signed with a secret so the server can verify authenticity.
- **Access token** (short-lived, in memory) authorizes normal requests.
- **Refresh token** (long-lived, HTTP-only cookie) only mints new access tokens.
- **Token rotation** issues a fresh refresh token on every refresh and invalidates the old one via the session record.
- **Sessions** (one per device, storing the refresh-token hash) enable server-side revocation → **logout** and **logout-all**.
- **Token blacklisting** enables instant access-token revocation at the cost of per-request lookups; short-lived access tokens are the cheaper, stateless alternative.
- **OTP email verification** proves the email is real before granting full access, blocking bots and spam.
- **Never store secrets in plain text:** passwords, refresh tokens, and OTPs are all hashed with `crypto` (SHA-256).
